import { writable } from 'svelte/store';

const initStoreApi = () => { 
    const { subscribe, set, update } = writable();
 
    return {
        api_key: ""
        };
 };

 const initStoreUsername = () => { 
    const { subscribe, set, update } = writable();
 
    return {
        api_key: "",
        username_store: ""
        };
 };
 
 export const api_key = initStoreApi();
 export const username_store = initStoreUsername();
