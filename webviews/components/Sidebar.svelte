<script lang="ts">
import LoginComponent from "../routes/LoginComponent.svelte";
import AfterLogin from "./Dashboard.svelte";
import { store } from '../../src/hooks/auth';

</script>

{#if $store != null }
	<AfterLogin />
{:else }
	<LoginComponent />
{/if}
