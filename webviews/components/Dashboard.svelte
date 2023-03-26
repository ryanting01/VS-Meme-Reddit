<script>
import { onMount } from "svelte";
import { api_key } from "../../src/stores";
// import { navOptions } from  './Nav.svelte';	// import application navigation
import Course from "./Course.svelte"
import { store } from '../../src/hooks/auth';

var courses;
var course_titles = [];
var checkedSettings = false;

var navOptions = [];
let selected;
let intSelected = 0;	// selected page index

let y

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

function getSettings() {
	tsvscode.postMessage({
        type:"getSettings"
    })
}

function logOut() {
	store.set(null);
	api_key.set(null);
	tsvscode.setState({
		api_key:null,
		username:null
	});
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
	selected = navOptions[0];

	if (!checkedSettings) {
		getSettings();
	}

	// Handle the message inside the webview
	window.addEventListener('message', event => {
		const message = event.data; // The JSON data our extension sent
		var state = tsvscode.getState();
		state.gradeable = message.gradeable;
		state.course = message.course;
		tsvscode.setState(state);
		if(message.course) {
			for (let i in navOptions) {
				if (navOptions[i].page.id==message.course) {
					setInitialComponent(i)
					selected = navOptions[i];
					checkedSettings = true;
				}
			}
			if (!checkedSettings) {
				selected = navOptions[0];
			}
		}
		checkedSettings = true;
	});



});

function setInitialComponent(event) {
	selected = navOptions[event];
	intSelected = event;
}

// change the selected component (the event.originalTarget.id is not accessible in Chrome so switched to event.srcElement.id)
function changeComponent(event) {
	selected = navOptions[event.srcElement.id];
	intSelected = event.srcElement.id;
}
</script>

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">


<div class="main">

{#if navOptions.length>0 && checkedSettings}
	<!-- Include Bootstrap CSS-->
	<!-- <div class="container fixed-top " style="margin-top:20px;"> -->
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
		<button type="button" class="btn btn-primary "  on:click={logOut}>
			Log Out
		</button>		
	<!-- </div> -->
{/if}
</div>
<svelte:window bind:scrollY={y} />

<style>
	.main {height: 150vh;  margin-top: 50px;}
</style>
