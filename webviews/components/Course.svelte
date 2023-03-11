<script>
export let course;

import { onMount } from "svelte";
import { compute_rest_props } from "svelte/internal";
import { api_key } from "../../src/stores";
import Gradeable from "./Gradeable.svelte";

var gradeables;
var gradeable_infos = [];

let selected;

let unique = {} // every {} is unique, {} === {} evaluates to false

function restart() {
   unique = {}
}

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
				var result_info = new Object();
				if (gradeables[key].submissionClosed) {
					// result_info["submissionClosed"] = true;
					info["submissionClosed"] = true;
				} else {
					// result_info["submissionClosed"] = false;
					info["submissionClosed"] = false;
				}
				if (gradeables[key].isTeamAssignment) {
					// result_info["isTeamAssignment"] = true;
					info["isTeamAssignment"] = true;
				} else {
					// result_info["isTeamAssignment"] = false;
					info["isTeamAssignment"] = false;
				}
				// info["results"] = result_info;
				gradeable_infos.push(info);
				gradeable_infos = gradeable_infos;
			}
			selected = gradeable_infos[0];
		})
		.catch(error => console.log('error', error));

});

</script>

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">

{#if gradeable_infos.length>0}
	<div class="vstack gap-3">

		<div class="bg-light border rounded-3">
			<p class="fw-light">Select Gradeable</p>
			<select class="form-select" aria-label="Select Gradeable" bind:value={selected}>
				{#each gradeable_infos as info}
					<option value={info}>
						{info.title}
					</option>
				{/each}
			</select>
		</div>

		<div>
			{#key unique}
				{#key selected}
					<Gradeable gradeable={selected.title} semester={selected.semester} course={course} id={selected.id} submissionClosed={selected.submissionClosed} isTeamAssignment={selected.isTeamAssignment}/>
				{/key}
			{/key}
			<button class="float-right" on:click={restart}>Restart</button>
		</div>
		
	</div>
{/if}
