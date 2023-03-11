<script>
import { onMount } from "svelte";
import { api_key } from "../../src/stores";
// import { navOptions } from  './Nav.svelte';	// import application navigation
import Course from "./Course.svelte"

var courses;
var course_titles = [];

var navOptions = [];
let selected;
let intSelected = 0;	// selected page index

function courseIdToTitle (course_id) {
	let result = "";

	for (let i in course_id) {
		let current_char = course_id.charAt(i);
		if (i==0) {
			result += current_char.toUpperCase();
		} else if (current_char=="_") {
			result += " ";
		} else {
			result += course_id.charAt(i);
		}
	}
	return result;
}

onMount(async () => {
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
			//To Do: Make title the display namen
			for (let i = 0; i < courses.length; i++) {
				let course = new Object();
				course["display_title"] = courseIdToTitle(courses[i].title);
				course["id"] = courses[i].title;
				course_titles.push(course);
				course_titles = course_titles;
			}
		})
		.catch(error => console.log('error', error));

	for (let i=0; i < courses.length; i++) {
		let new_page = {
			page:course_titles[i],
			component: Course,
			props: {course: course_titles[i]}
		};
		navOptions.push(new_page);
		navOptions = navOptions;
	}
	selected = navOptions[0];	// keep track of the selected 'page' object (default to the about component since we must have local db connection established first)
});

// change the selected component (the event.originalTarget.id is not accessible in Chrome so switched to event.srcElement.id)
function changeComponent(event) {
	console.log("Change component");
	selected = navOptions[event.srcElement.id];
	intSelected = event.srcElement.id;
}
</script>

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">

{#if navOptions.length>0}
	<!-- Include Bootstrap CSS-->
	<div class="container fixed-top" style="margin-top:20px;">
		<!--app navigation -->
		<ul class="nav nav-tabs">
			{#each navOptions as option, i}
			<li class="nav-item">
				<button class={intSelected==i ? "nav-link active p-2 ml-1" : "p-2 ml-1 nav-link"} on:click={changeComponent} id={i} role="tab">{option.page.display_title}</button>
			</li>
			{/each}
		</ul>
		<!-- content wrapper -->
		<div class="row">
			<div class="col-sm-12">
				<div class="p-2">
					<h1 class="text-center">{selected.page.display_title}</h1>
					<!-- this is where our main content is placed -->
					{#key selected.page.id}
						<Course course={selected.page.id}/>
					{/key}
				</div>
			</div>
		</div>
	</div>
{/if}
