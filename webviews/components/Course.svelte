<script>
export let course;

import { onMount } from "svelte";
  import { compute_rest_props } from "svelte/internal";
import { api_key } from "../../src/stores";
import Gradeable from "./Gradeable.svelte";

var gradeables;
var gradeable_infos = [];

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
				var info = new Object();
				info['title'] = gradeables[key].title;
				info["semester"] = gradeables[key].semester;
				info["id"] = gradeables[key].id;
				gradeable_infos.push(info);
				gradeable_infos = gradeable_infos;
			}
			selected = gradeable_infos[0];
		})
		.catch(error => console.log('error', error));

});

</script>
{#if gradeable_infos.length>0}
	<select bind:value={selected}>
		{#each gradeable_infos as info}
			<option value={info}>
				{info.title}
			</option>
		{/each}
	</select>

	{#key selected}
		<Gradeable gradeable={selected.title} semester={selected.semester} course={course} id={selected.id}/>
	{/key}
{/if}
