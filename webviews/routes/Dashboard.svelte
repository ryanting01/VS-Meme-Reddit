<script>
	import { store } from '../../src/hooks/auth';
	import LoginComponent from '../Components/LoginComponent.svelte';
	import AfterLogin from "../components/Dashboard.svelte";

</script>

{#if $store != null }
	<AfterLogin />
{:else }
	<LoginComponent />
{/if}
  