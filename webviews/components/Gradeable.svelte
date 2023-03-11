<script lang="ts">
    export let gradeable:string;
    export let semester:string;
    export let course:string;
    export let id:string;
    export let submissionClosed:boolean;
    export let isTeamAssignment:boolean;

    import { onMount } from "svelte";
    import { api_key } from "../../src/stores";
    import { get } from 'svelte/store'
    import { username_store } from "../../src/stores";
    import vscode from "vscode";

    var response = "";

    // let files: ArrayLike<unknown> | Iterable<unknown>;
    let files:FileList;
    let gradeableResults: string | any[] = [];

	// $: if (!results.submissionClosed && !results.isTeamAssignment) {
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

    function showDiff() {
        // vscode.commands.executeCommand('code --diff hi.txt hi1.txt');
        console.log("hi");
    }

    function submitToSubmitty() {
        // let api : string|Number;
        // api_key.subscribe(value => {
        //     api = value;
        // });
        var api = get(api_key);
        // let user_id;
        // username_store.subscribe(value => {
        //     user_id = value;
        // });
        const user_id = get(username_store);

        var formdata = new FormData();
        // formdata.append("Authorization", api);
        // formdata.append("User_id", user_id);
        formdata.append("Authorization", api);
        formdata.append("User_id", user_id);
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
            } else {
                return;
            }
        })
        .catch(error => console.log('error', error));
    }

</script>


<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">

<button type="button" class="btn btn-primary " on:click={showDiff}>
    Show Diff
</button>


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

    {isTeamAssignment}


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