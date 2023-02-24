<script context="module">
    // main navigation for the application
    import { onMount } from "svelte";
    import { api_key } from "../../src/stores";
    import Course from "./Course.svelte"

    var courses;
    var course_titles = [];


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
                    course_titles.push(courses[i].title);
                    course_titles = course_titles;
                }
            })
            .catch(error => console.log('error', error));
    });

    const navOptions = []

    for (let i=0; i < courses.length; i++) {
        let new_page = {page:course_titles[i], Course};
        navOptions.append(new_page);
    }

    export {navOptions};


</script>