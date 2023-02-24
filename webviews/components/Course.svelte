<script>
export let course;

import { onMount } from "svelte";
import { api_key } from "../../src/stores";

var gradeables;
var gradeable_titles = [];

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

});



</script>



<ul>
	{#each gradeable_titles as title}
		<li>
			{title}
		</li>
	{/each}
</ul>