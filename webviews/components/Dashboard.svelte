<script>
import { onMount } from "svelte";
import { api_key } from "../../src/stores";
import { navOptions } from  './Nav.svelte';	// import application navigation
import Course from "./Course.svelte"

var courses;
var course_titles = [];

let selected = navOptions[0];	// keep track of the selected 'page' object (default to the about component since we must have local db connection established first)
let intSelected = 0;	// selected page index

onMount(async () => {
	console.log("CALL MADE");
	let api;
	api_key.subscribe(value => {
		api = value;
	});

	var raw = JSON.stringify({
		"Authorization": api
	});

	var myHeaders = new Headers();
	myHeaders.append("Content-Type", "application/json");

	var requestOptions = {
		method: 'POST',
		headers: myHeaders,
		redirect: 'follow',
		body: raw
	  };


	await fetch("http://localhost:3000/courses", requestOptions)
		.then(response => response.json())
		.then(result => {
			courses = result.data.unarchived_courses;
			for (let i = 0; i < courses.length; i++) {
				course_titles.push(courses[i].title);
				course_titles = course_titles;
			}
		})
		.catch(error => console.log('error', error));
});

// change the selected component (the event.originalTarget.id is not accessible in Chrome so switched to event.srcElement.id)
function changeComponent(event) {
	selected = navOptions[event.srcElement.id];
	intSelected = event.srcElement.id;
}
//THIS CALLS BEFORE ON MOUNT

</script>


<!-- <ul>
	{#each course_titles as title}
		<li>
			{title}
			<Course course={title}></Course>
		</li>
	{/each}
</ul> -->

<!-- Include Bootstrap CSS-->
<link rel='stylesheet' href='https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css'>
<div class="container">
	<!--app navigation -->
	<ul class="nav nav-tabs">
		{#each navOptions as option, i}
		<li class="nav-item">
			<button class={intSelected==i ? "nav-link active p-2 ml-1" : "p-2 ml-1 nav-link"} on:click={changeComponent} id={i} role="tab">{option.page}</button>
		</li>
		{/each}
	</ul>
	<!-- content wrapper -->
	<div class="row">
		<div class="col-sm-12">
			<div class="p-2">
				<h1>{selected.page}</h1>
				<!-- this is where our main content is placed -->
				<svelte:component this={selected.component}/>
			</div>
		</div>
	</div>
</div>
