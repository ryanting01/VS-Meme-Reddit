<script context="module">
    // main navigation for the application
    import { onMount } from "svelte";
    import { api_key } from "../../src/stores";
    import Course from "./Course.svelte"
    import { store } from '../../src/hooks/auth';

    var courses;
    var course_titles = [];
    const navOptions = []

    async function getCourses() {

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
                console.log("IN get courses");
                console.log(result);
                courses = result.data.unarchived_courses;
                for (let i = 0; i < courses.length; i++) {
                    course_titles.push(courses[i].title);
                    course_titles = course_titles;
                }
            })
            .catch(error => console.log('error', error));
    }

    function getNavOptions() {
        console.log("Outside get courses");
        for (let i=0; i < courses.length; i++) {
            let new_page = {page:course_titles[i]};
            navOptions.append(new_page);
        }
    }

    if (store != null) {
    getCourses();
    setTimeout(getNavOptions, 3000);
    }
    export {navOptions};

</script>