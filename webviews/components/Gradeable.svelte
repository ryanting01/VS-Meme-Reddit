<script>
    export let gradeable;
    export let semester;
    export let course;
    export let id;

    import { onMount } from "svelte";
    import { api_key } from "../../src/stores";
    import { username_store } from "../../src/stores";

    var response = "";
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
        let user_id;
        username_store.subscribe(value => {
            user_id = value;
        });

        var formdata = new FormData();
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

{response}
