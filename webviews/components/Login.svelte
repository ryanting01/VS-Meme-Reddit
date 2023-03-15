<script>
	import { getUserDetails } from '../../src/hooks/auth';
	import { store } from '../../src/hooks/auth';
	// import { api_key } from "../../src/stores";
	import { username_store } from "../../src/stores";
	import { api_key } from "../../src/stores";

	let username = '';
	let password = '';
	let error = ''

	async function login() {

		const user = await getUserDetails( username, password )

		if ( user ) {
			console.log(user)
			$store = user
			username_store.set(username);
			if ( error ) error = ''
		}
		else {
			error = 'Incorrect username and password.'
			console.log("Incorrect username and password.")
		}

	}

</script>

<link rel='stylesheet' href='https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css'>

<div class="vstack gap-3">

	<div>
		<h1><img src="img/submitty_logo.png" alt="..." height="36"> hey</h1>
	</div>
	
	<div>
		<h1 class="app-title">Submitty Extension</h1>
	</div>
	
	<div>
		<form on:submit|preventDefault={login}>
			<div class="form-group">
			<label for="username">Username</label>
			<input type="username" class="form-control" id="username" bind:value={username} aria-describedby="emailHelp" placeholder="Username">
			</div>
			<div class="form-group">
			<label for="password">Password</label>
			<input type="password" class="form-control" id="password" bind:value={password} placeholder="Password">
			</div>
			<button type="submit" class="btn btn-primary">Submit</button>
		</form>	
	</div>

	<div>
		<small>{error}</small>
	</div>

</div>