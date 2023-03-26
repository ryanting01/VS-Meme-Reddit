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
	  
	var isCorrect = false;

	await fetch("http://localhost:3000/token", requestOptions)
		.then(response => response.text())
		.then(result => {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			var data_json = JSON.parse(result);
			if (data_json.status === 'success') {
				api_key.set(data_json.data.token);
				tsvscode.setState({
					api_key:data_json.data.token,
					username:username
				});
				isCorrect = true;
			}
		})
		.catch(error => console.log('error', error));

	if (isCorrect===true) {
		return 1;
	}

};
export const checkAuthState = async () => {

	state = false;
	var state = tsvscode.getState();
	if (state.api_key) {

		var raw = JSON.stringify({
			"Authorization": state.api_key
		});
	
		var myHeaders = new Headers();
		myHeaders.append("Content-Type", "application/json");
	
		var requestOptions = {
			method: 'POST',
			headers: myHeaders,
			redirect: 'follow',
			body: raw
		  };
	
		await fetch("http://localhost:3000/validateToken", requestOptions)
		.then(response => response.text())
		.then(result => {
			if(result==="success") {
				api_key.set(state.api_key);
				state = true;
				return 1;
			}
		})
		.catch(error => console.log('error', error));


		if(state){
			return 1;
 		}

	}

};
