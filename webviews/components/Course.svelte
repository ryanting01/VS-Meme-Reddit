<script>
export let course;

import { onMount } from "svelte";
import { api_key } from "../../src/stores";
import Gradeable from "./Gradeable.svelte";

var gradeables;
var gradeable_titles = [];

let selected;

onMount(async () => {

	let api;
	api_key.subscribe(value => {
		api = value;
	});
	var raw = JSON.stringify({
		"Authorization": api,
		"course": course
	});

	var myHeaders = new Headers();
	myHeaders.append("Content-Type", "application/json");

	var requestOptions = {
		method: 'POST',
		headers: myHeaders,
		redirect: 'follow',
		body: raw
	};

	await fetch("http://localhost:3000/courseGradeables", requestOptions)
		.then(response => response.json())
		.then(result => {
			gradeables = result[course];
			for (var key in gradeables) {
				gradeable_titles.push(gradeables[key].title);
				gradeable_titles = gradeable_titles;
			}
		})
		.catch(error => console.log('error', error));

	selected = gradeable_titles[0];

});



</script>

<select bind:value={selected}>
	{#each gradeable_titles as title}
		<option value={title}>
			{title}
		</option>
	{/each}
</select>

{#key selected}
	<Gradeable gradeable={selected}/>
{/key}


<!-- <ul>
	{#each gradeable_titles as title}
		<li>
			{title}
		</li>
	{/each}
</ul> -->