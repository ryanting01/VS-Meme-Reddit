<script>
    export let gradeable;
    
    import { onMount } from "svelte";
    import { api_key } from "../../src/stores";
    
    var gradeables;
    var gradeable_titles = [];

    gradeable = "";

	let files;

	$: if (files) {
		// Note that `files` is of type `FileList`, not an Array:
		// https://developer.mozilla.org/en-US/docs/Web/API/FileList
		console.log(files);

		for (const file of files) {
			console.log(`${file.name}: ${file.size} bytes`);
		}
	}

    function submitToSubmitty() {

        let api;
        api_key.subscribe(value => {
            api = value;
        });

        var myHeaders = new Headers();
        myHeaders.append("Authorization", api);

        var formdata = new FormData();
        formdata.append("user_id", "student");
        formdata.append("previous_files", "");
        formdata.append("semester", "s23");
        formdata.append("course", "development");
        formdata.append("gradeable", "cpp_buggy_custom");
        // formdata.append("file", fileInput.files[0], "Ryan_Ting_Canada_Feb_2023.pdf");
        formdata.append("file", files[0], "Ryan_Ting_Canada_Feb_2023.pdf");

        var requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: formdata,
        redirect: 'follow'
        };

        fetch("http://localhost:1511/api/submit", requestOptions)
        .then(response => response.text())
        .then(result => console.log(result))
        .catch(error => console.log('error', error));
            }

</script>


<label for="many">Upload multiple files of any type:</label>
<input
	bind:files
	id="many"
	multiple
	type="file"
/>

{#if files}
	<h2>Selected files:</h2>
	{#each Array.from(files) as file}
		<p>{file.name} ({file.size} bytes) </p>
	{/each}
{/if}

<button on:click={submitToSubmitty}>Submit</button>
