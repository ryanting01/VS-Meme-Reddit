<script>
    export let gradeable;
    export let semester;
    export let course;
    export let id;
    export let submissionClosed;
    export let isTeamAssignment;

    import { onMount } from "svelte";
    import { api_key } from "../../src/stores";
    import { get } from 'svelte/store'
    import { username_store } from "../../src/stores";

    var response = "";

    let files;
    let gradeableResults = [];
    let submissionFile;

    $: if (!submissionClosed && !isTeamAssignment) {
        getGradeableResults();
    }

    $: if (files) {
		// Note that `files` is of type `FileList`, not an Array:
		// https://developer.mozilla.org/en-US/docs/Web/API/FileList
		console.log(files);

		// for (const file of files) {
		// 	console.log(`${file.name}: ${file.size} bytes`);
		// }
	}

    function submitToSubmitty() {
        var state = tsvscode.getState();
        var api = get(api_key);
        var username = state.username;
        
        var formdata = new FormData();
        formdata.append("Authorization", api);
        formdata.append("User_id", username);
        formdata.append("previous_files", "");
        formdata.append("Semester", semester);
        formdata.append("Course", course);
        formdata.append("Gradeable", id);
        formdata.append("files", files[0], files[0].name);

        var requestOptions = {
        method: 'POST',
        body: formdata,
        redirect: 'follow'
        };

        fetch("http://localhost:3000/submit", requestOptions)
        .then(response => response.json())
        .then(result => {
            response = result.data;
        })
        .catch(error => console.log('error', error));
    }

    function getGradeableResults() {
        let api;
        api_key.subscribe(value => {
            api = value;
        });
        var raw = JSON.stringify({
            "Authorization": api,
            "course": course,
            "semester": semester,
            "gradeable": id
        });
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        var requestOptions = {
            method: 'POST',
            headers: myHeaders,
            body: raw,
            redirect: 'follow'
        };

        fetch("http://localhost:3000/gradeableResults", requestOptions)
        .then(response => response.json())
        .then(result => {
            if (result.status=="success") {
                gradeableResults = result["data"].reverse();
                for (let i in gradeableResults) {
                    let version = gradeableResults[i].version;
                    gradeableResults[i].version = Number(version) +1;

                    let result = gradeableResults[i].result*100;
                    gradeableResults[i].result = result.toFixed(2);

                }
            } else {
                return;
            }
        })
        .catch(error => console.log('error', error));
    }

    function getSubmissionFile(version) {
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        let api;
        api_key.subscribe(value => {
            api = value;
        });

        var raw = JSON.stringify({
            "Authorization": api,
            "semester": semester,
            "course": course,
            "gradeable": id,
            "version": version,
            "file_num": "0"
        });

        var requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
        };

        fetch("http://localhost:3000/getSubmissionFiles", requestOptions)
        .then(response => response.text())
        .then(result => {
            submissionFile = result;
        })
        .catch(error => console.log('error', error));
    }


</script>


<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">

<div class="vstack gap-3 position-relative">
    <div class="vstack gap-3 bg-light border rounded-3">
        <p class="fs-2">Upload files to {gradeable}</p>

        <div class="vstack gap-3">
            <input 
            bind:files
            id="folder-opener"
            multiple
            type="file">
        </div>
        
        <div>
            {#if files}
                <h2>Selected files:</h2>
                {#each Array.from(files) as file}
                    <p>{file.name} ({file.size} bytes)</p>
                {/each}
            {/if}
        </div>
        
        <div class="d-grid gap-2 col-6 text-center">
            <button type="button" class="btn btn-primary " on:click={submitToSubmitty}>
                Submit
            </button>
            <div>
                {response}
            </div>
        </div>
    </div>


    {#if submissionClosed}
        <p class="fs-2">Submission is closed, go to web application for results</p>
    {:else if isTeamAssignment}
        <p class="fs-2">This is a team submission, results on web application</p>
    {:else if gradeableResults.length>0}
        <div class="bg-light border rounded-3">

            <p class="fs-2">Version results for {gradeable}</p>

            <div class="table-wrapper-scroll-y my-custom-scrollbar">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th scope="col">Version</th>
                            <th scope="col">Grade (%)</th>
                        </tr>
                    </thead>
                    <tbody>
                    {#each gradeableResults as result}
                        <tr>
                            <th scope="row">{result.version}</th>
                            <td>{result.result}</td>
                            <td>
                                <button class="btn btn-primary " 
                                on:click={ async () => {
                                    await getSubmissionFile(result.version);
                                    tsvscode.postMessage({
                                        type:"writeAndDiff",
                                        value: submissionFile,
                                        title: id+result.version
                                    })
                                }}>See Diff</button>
                            </td>
                        </tr>
                    {/each}
                    </tbody>
                </table>
            </div>    
        </div>
    {:else}
        <p class="fs-2">No submission for {gradeable} so far</p>
    {/if} 


</div>

<style>
    .my-custom-scrollbar {
        position: relative;
        height: 200px;
        overflow: auto;
    }
    .table-wrapper-scroll-y {
        display: block;
    }

</style>