import { writable } from 'svelte/store';
import { api_key } from '../stores';

export var store = writable(null);

let sessions = [];

export const getUserDetails = async ( username, password ) => {

	var myHeaders = new Headers();
	myHeaders.append("Content-Type", "application/json");

	var raw = JSON.stringify({
		// eslint-disable-next-line @typescript-eslint/naming-convention
		"user_id": username,
		"password": password
	});

	var requestOptions = {
		method: 'POST',
		headers: myHeaders,
		body: raw,
		redirect: 'follow'
	};
	  
	// var response = await fetch("http://localhost:3000/token", requestOptions);
	// const tokenData = JSON.parse(response);
	// console.log(tokenData);

	// if (response.ok) {
	// 	console.log("hello");
	// 	// const data = response.json();
	// 	const data = JSON.stringify(response);
	// 	console.log("hello1");
	// 	console.log(data);
	// 	if (response.status === "success") {
	// 		return 1;
	// 	}
	// };

	var isCorrect = false;

	await fetch("http://localhost:3000/token", requestOptions)
		.then(response => response.text())
		.then(result => {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			var data_json = JSON.parse(result);
			if (data_json.status === 'success') {
				api_key.set(data_json.data.token);

				// let api;
				// api_key.subscribe(value => {
				// 	api = value;
				// });
				// console.log("api from auth.js is : " + api);

				isCorrect = true;
			}
		})
		.catch(error => console.log('error', error));

	if (isCorrect===true) {
		return 1;
	}

};