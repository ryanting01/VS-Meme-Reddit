var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function set_store_value(store, ret, value) {
        store.set(value);
        return ret;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
        select.selectedIndex = -1; // no option should be selected
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.55.1' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const api_key = writable(0);

    var store = writable(null);

    const getUserDetails = async ( username, password ) => {

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

    /* webviews/routes/LoginComponent.svelte generated by Svelte v3.38.2 */

    const { console: console_1$3 } = globals;
    const file$3 = "webviews/routes/LoginComponent.svelte";

    function create_fragment$4(ctx) {
    	let form;
    	let div0;
    	let label0;
    	let t1;
    	let input0;
    	let t2;
    	let div1;
    	let label1;
    	let t4;
    	let input1;
    	let t5;
    	let button;
    	let t7;
    	let div2;
    	let small;
    	let t8;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			form = element("form");
    			div0 = element("div");
    			label0 = element("label");
    			label0.textContent = "Username";
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			div1 = element("div");
    			label1 = element("label");
    			label1.textContent = "Password";
    			t4 = space();
    			input1 = element("input");
    			t5 = space();
    			button = element("button");
    			button.textContent = "Submit";
    			t7 = space();
    			div2 = element("div");
    			small = element("small");
    			t8 = text(/*error*/ ctx[2]);
    			attr_dev(label0, "for", "username");
    			attr_dev(label0, "class", "form-label");
    			add_location(label0, file$3, 30, 2, 602);
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "class", "form-control");
    			attr_dev(input0, "id", "username");
    			add_location(input0, file$3, 31, 2, 662);
    			attr_dev(div0, "class", "mb-3");
    			add_location(div0, file$3, 29, 1, 581);
    			attr_dev(label1, "for", "password");
    			attr_dev(label1, "class", "form-label");
    			add_location(label1, file$3, 35, 2, 772);
    			attr_dev(input1, "type", "password");
    			attr_dev(input1, "class", "form-control");
    			attr_dev(input1, "id", "password");
    			add_location(input1, file$3, 36, 2, 832);
    			attr_dev(div1, "class", "mb-3");
    			add_location(div1, file$3, 34, 1, 751);
    			attr_dev(button, "type", "submit");
    			attr_dev(button, "class", "btn btn-primary");
    			add_location(button, file$3, 39, 1, 925);
    			add_location(small, file$3, 41, 2, 1035);
    			attr_dev(div2, "id", "error_message");
    			attr_dev(div2, "class", "text-danger");
    			add_location(div2, file$3, 40, 1, 988);
    			attr_dev(form, "class", "flex mx-auto col-6");
    			add_location(form, file$3, 27, 0, 512);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, form, anchor);
    			append_dev(form, div0);
    			append_dev(div0, label0);
    			append_dev(div0, t1);
    			append_dev(div0, input0);
    			set_input_value(input0, /*username*/ ctx[0]);
    			append_dev(form, t2);
    			append_dev(form, div1);
    			append_dev(div1, label1);
    			append_dev(div1, t4);
    			append_dev(div1, input1);
    			set_input_value(input1, /*password*/ ctx[1]);
    			append_dev(form, t5);
    			append_dev(form, button);
    			append_dev(form, t7);
    			append_dev(form, div2);
    			append_dev(div2, small);
    			append_dev(small, t8);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[4]),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[5]),
    					listen_dev(form, "submit", prevent_default(/*login*/ ctx[3]), false, true, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*username*/ 1 && input0.value !== /*username*/ ctx[0]) {
    				set_input_value(input0, /*username*/ ctx[0]);
    			}

    			if (dirty & /*password*/ 2 && input1.value !== /*password*/ ctx[1]) {
    				set_input_value(input1, /*password*/ ctx[1]);
    			}

    			if (dirty & /*error*/ 4) set_data_dev(t8, /*error*/ ctx[2]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(form);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $store;
    	validate_store(store, "store");
    	component_subscribe($$self, store, $$value => $$invalidate(6, $store = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("LoginComponent", slots, []);
    	let username = "";
    	let password = "";
    	let error = "";

    	async function login() {
    		const user = await getUserDetails(username, password);

    		if (user) {
    			console.log(user);
    			set_store_value(store, $store = user, $store);
    			if (error) $$invalidate(2, error = "");
    		} else {
    			$$invalidate(2, error = "Incorrect username and password.");
    			console.log("Incorrect username and password.");
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1$3.warn(`<LoginComponent> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		username = this.value;
    		$$invalidate(0, username);
    	}

    	function input1_input_handler() {
    		password = this.value;
    		$$invalidate(1, password);
    	}

    	$$self.$capture_state = () => ({
    		getUserDetails,
    		store,
    		api_key,
    		username,
    		password,
    		error,
    		login,
    		$store
    	});

    	$$self.$inject_state = $$props => {
    		if ("username" in $$props) $$invalidate(0, username = $$props.username);
    		if ("password" in $$props) $$invalidate(1, password = $$props.password);
    		if ("error" in $$props) $$invalidate(2, error = $$props.error);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [username, password, error, login, input0_input_handler, input1_input_handler];
    }

    class LoginComponent extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "LoginComponent",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* webviews/components/Gradeable.svelte generated by Svelte v3.38.2 */

    const { console: console_1$2 } = globals;
    const file$2 = "webviews/components/Gradeable.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (67:0) {#if files}
    function create_if_block$2(ctx) {
    	let h2;
    	let t1;
    	let each_1_anchor;
    	let each_value = Array.from(/*files*/ ctx[0]);
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "Selected files:";
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    			add_location(h2, file$2, 67, 1, 1648);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h2, anchor);
    			insert_dev(target, t1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*Array, files*/ 1) {
    				each_value = Array.from(/*files*/ ctx[0]);
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t1);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(67:0) {#if files}",
    		ctx
    	});

    	return block;
    }

    // (69:1) {#each Array.from(files) as file}
    function create_each_block$2(ctx) {
    	let p;
    	let t0_value = /*file*/ ctx[6].name + "";
    	let t0;
    	let t1;
    	let t2_value = /*file*/ ctx[6].size + "";
    	let t2;
    	let t3;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t0 = text(t0_value);
    			t1 = text(" (");
    			t2 = text(t2_value);
    			t3 = text(" bytes) ");
    			add_location(p, file$2, 69, 2, 1710);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t0);
    			append_dev(p, t1);
    			append_dev(p, t2);
    			append_dev(p, t3);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*files*/ 1 && t0_value !== (t0_value = /*file*/ ctx[6].name + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*files*/ 1 && t2_value !== (t2_value = /*file*/ ctx[6].size + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(69:1) {#each Array.from(files) as file}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let label;
    	let t1;
    	let input;
    	let t2;
    	let t3;
    	let button;
    	let mounted;
    	let dispose;
    	let if_block = /*files*/ ctx[0] && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			label = element("label");
    			label.textContent = "Upload multiple files of any type:";
    			t1 = space();
    			input = element("input");
    			t2 = space();
    			if (if_block) if_block.c();
    			t3 = space();
    			button = element("button");
    			button.textContent = "Submit";
    			attr_dev(label, "for", "many");
    			add_location(label, file$2, 58, 0, 1517);
    			attr_dev(input, "id", "many");
    			input.multiple = true;
    			attr_dev(input, "type", "file");
    			add_location(input, file$2, 59, 0, 1578);
    			add_location(button, file$2, 73, 0, 1766);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, label, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, input, anchor);
    			insert_dev(target, t2, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "change", /*input_change_handler*/ ctx[3]),
    					listen_dev(button, "click", /*submitToSubmitty*/ ctx[1], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*files*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					if_block.m(t3.parentNode, t3);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(label);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(input);
    			if (detaching) detach_dev(t2);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(button);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Gradeable", slots, []);
    	let { gradeable } = $$props;
    	var gradeables;
    	var gradeable_titles = [];
    	gradeable = "";
    	let files;

    	function submitToSubmitty() {
    		let api;

    		api_key.subscribe(value => {
    			api = value;
    		});

    		var myHeaders = new Headers();
    		myHeaders.append("Authorization", api);
    		var formdata = new FormData();
    		formdata.append("user_id", "student");
    		formdata.append("previous_files", "");
    		formdata.append("semester", "s23");
    		formdata.append("course", "development");
    		formdata.append("gradeable", "cpp_buggy_custom");

    		// formdata.append("file", fileInput.files[0], "Ryan_Ting_Canada_Feb_2023.pdf");
    		formdata.append("file", files[0], "Ryan_Ting_Canada_Feb_2023.pdf");

    		var requestOptions = {
    			method: "POST",
    			headers: myHeaders,
    			body: formdata,
    			redirect: "follow"
    		};

    		fetch("http://localhost:1511/api/submit", requestOptions).then(response => response.text()).then(result => console.log(result)).catch(error => console.log("error", error));
    	}

    	const writable_props = ["gradeable"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1$2.warn(`<Gradeable> was created with unknown prop '${key}'`);
    	});

    	function input_change_handler() {
    		files = this.files;
    		$$invalidate(0, files);
    	}

    	$$self.$$set = $$props => {
    		if ("gradeable" in $$props) $$invalidate(2, gradeable = $$props.gradeable);
    	};

    	$$self.$capture_state = () => ({
    		gradeable,
    		onMount,
    		api_key,
    		gradeables,
    		gradeable_titles,
    		files,
    		submitToSubmitty
    	});

    	$$self.$inject_state = $$props => {
    		if ("gradeable" in $$props) $$invalidate(2, gradeable = $$props.gradeable);
    		if ("gradeables" in $$props) gradeables = $$props.gradeables;
    		if ("gradeable_titles" in $$props) gradeable_titles = $$props.gradeable_titles;
    		if ("files" in $$props) $$invalidate(0, files = $$props.files);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*files*/ 1) {
    			if (files) {
    				// Note that `files` is of type `FileList`, not an Array:
    				// https://developer.mozilla.org/en-US/docs/Web/API/FileList
    				console.log(files);

    				for (const file of files) {
    					console.log(`${file.name}: ${file.size} bytes`);
    				}
    			}
    		}
    	};

    	return [files, submitToSubmitty, gradeable, input_change_handler];
    }

    class Gradeable extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { gradeable: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Gradeable",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*gradeable*/ ctx[2] === undefined && !("gradeable" in props)) {
    			console_1$2.warn("<Gradeable> was created without expected prop 'gradeable'");
    		}
    	}

    	get gradeable() {
    		throw new Error("<Gradeable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set gradeable(value) {
    		throw new Error("<Gradeable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews/components/Course.svelte generated by Svelte v3.38.2 */

    const { console: console_1$1 } = globals;
    const file$1 = "webviews/components/Course.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	return child_ctx;
    }

    // (54:1) {#each gradeable_titles as title}
    function create_each_block$1(ctx) {
    	let option;
    	let t0_value = /*title*/ ctx[5] + "";
    	let t0;
    	let t1;
    	let option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t0 = text(t0_value);
    			t1 = space();
    			option.__value = option_value_value = /*title*/ ctx[5];
    			option.value = option.__value;
    			add_location(option, file$1, 54, 2, 1025);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t0);
    			append_dev(option, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*gradeable_titles*/ 1 && t0_value !== (t0_value = /*title*/ ctx[5] + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*gradeable_titles*/ 1 && option_value_value !== (option_value_value = /*title*/ ctx[5])) {
    				prop_dev(option, "__value", option_value_value);
    				option.value = option.__value;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(54:1) {#each gradeable_titles as title}",
    		ctx
    	});

    	return block;
    }

    // (61:0) {#key selected}
    function create_key_block$1(ctx) {
    	let gradeable;
    	let current;

    	gradeable = new Gradeable({
    			props: { gradeable: /*selected*/ ctx[1] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(gradeable.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(gradeable, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const gradeable_changes = {};
    			if (dirty & /*selected*/ 2) gradeable_changes.gradeable = /*selected*/ ctx[1];
    			gradeable.$set(gradeable_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(gradeable.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(gradeable.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(gradeable, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_key_block$1.name,
    		type: "key",
    		source: "(61:0) {#key selected}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let select;
    	let t;
    	let previous_key = /*selected*/ ctx[1];
    	let key_block_anchor;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*gradeable_titles*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	let key_block = create_key_block$1(ctx);

    	const block = {
    		c: function create() {
    			select = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			key_block.c();
    			key_block_anchor = empty();
    			if (/*selected*/ ctx[1] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[3].call(select));
    			add_location(select, file$1, 52, 0, 957);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, select, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, /*selected*/ ctx[1]);
    			insert_dev(target, t, anchor);
    			key_block.m(target, anchor);
    			insert_dev(target, key_block_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(select, "change", /*select_change_handler*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*gradeable_titles*/ 1) {
    				each_value = /*gradeable_titles*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*selected, gradeable_titles*/ 3) {
    				select_option(select, /*selected*/ ctx[1]);
    			}

    			if (dirty & /*selected*/ 2 && safe_not_equal(previous_key, previous_key = /*selected*/ ctx[1])) {
    				group_outros();
    				transition_out(key_block, 1, 1, noop);
    				check_outros();
    				key_block = create_key_block$1(ctx);
    				key_block.c();
    				transition_in(key_block);
    				key_block.m(key_block_anchor.parentNode, key_block_anchor);
    			} else {
    				key_block.p(ctx, dirty);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(key_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(key_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(select);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(t);
    			if (detaching) detach_dev(key_block_anchor);
    			key_block.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Course", slots, []);
    	let { course } = $$props;
    	var gradeables;
    	var gradeable_titles = [];
    	let selected;

    	onMount(async () => {
    		let api;

    		api_key.subscribe(value => {
    			api = value;
    		});

    		var raw = JSON.stringify({ "Authorization": api, course });
    		var myHeaders = new Headers();
    		myHeaders.append("Content-Type", "application/json");

    		var requestOptions = {
    			method: "POST",
    			headers: myHeaders,
    			redirect: "follow",
    			body: raw
    		};

    		await fetch("http://localhost:3000/courseGradeables", requestOptions).then(response => response.json()).then(result => {
    			gradeables = result[course];

    			for (var key in gradeables) {
    				gradeable_titles.push(gradeables[key].title);
    				$$invalidate(0, gradeable_titles);
    			}
    		}).catch(error => console.log("error", error));

    		$$invalidate(1, selected = gradeable_titles[0]);
    	});

    	const writable_props = ["course"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1$1.warn(`<Course> was created with unknown prop '${key}'`);
    	});

    	function select_change_handler() {
    		selected = select_value(this);
    		$$invalidate(1, selected);
    		$$invalidate(0, gradeable_titles);
    	}

    	$$self.$$set = $$props => {
    		if ("course" in $$props) $$invalidate(2, course = $$props.course);
    	};

    	$$self.$capture_state = () => ({
    		course,
    		onMount,
    		api_key,
    		Gradeable,
    		gradeables,
    		gradeable_titles,
    		selected
    	});

    	$$self.$inject_state = $$props => {
    		if ("course" in $$props) $$invalidate(2, course = $$props.course);
    		if ("gradeables" in $$props) gradeables = $$props.gradeables;
    		if ("gradeable_titles" in $$props) $$invalidate(0, gradeable_titles = $$props.gradeable_titles);
    		if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [gradeable_titles, selected, course, select_change_handler];
    }

    class Course extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { course: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Course",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*course*/ ctx[2] === undefined && !("course" in props)) {
    			console_1$1.warn("<Course> was created without expected prop 'course'");
    		}
    	}

    	get course() {
    		throw new Error("<Course>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set course(value) {
    		throw new Error("<Course>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews/components/Dashboard.svelte generated by Svelte v3.38.2 */

    const { console: console_1 } = globals;

    const file = "webviews/components/Dashboard.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	child_ctx[8] = i;
    	return child_ctx;
    }

    // (67:0) {#if navOptions.length>0}
    function create_if_block$1(ctx) {
    	let link;
    	let t0;
    	let div3;
    	let ul;
    	let t1;
    	let div2;
    	let div1;
    	let div0;
    	let h1;
    	let t2_value = /*selected*/ ctx[1].page + "";
    	let t2;
    	let t3;
    	let previous_key = /*selected*/ ctx[1].page;
    	let current;
    	let each_value = /*navOptions*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	let key_block = create_key_block(ctx);

    	const block = {
    		c: function create() {
    			link = element("link");
    			t0 = space();
    			div3 = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			t2 = text(t2_value);
    			t3 = space();
    			key_block.c();
    			attr_dev(link, "rel", "stylesheet");
    			attr_dev(link, "href", "https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css");
    			add_location(link, file, 68, 1, 1726);
    			attr_dev(ul, "class", "nav nav-tabs");
    			add_location(ul, file, 71, 2, 1882);
    			add_location(h1, file, 82, 5, 2251);
    			attr_dev(div0, "class", "p-2");
    			add_location(div0, file, 81, 4, 2228);
    			attr_dev(div1, "class", "col-sm-12");
    			add_location(div1, file, 80, 3, 2200);
    			attr_dev(div2, "class", "row");
    			add_location(div2, file, 79, 2, 2179);
    			attr_dev(div3, "class", "container");
    			add_location(div3, file, 69, 1, 1831);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, link, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div3, anchor);
    			append_dev(div3, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			append_dev(div3, t1);
    			append_dev(div3, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, h1);
    			append_dev(h1, t2);
    			append_dev(div0, t3);
    			key_block.m(div0, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*intSelected, changeComponent, navOptions*/ 13) {
    				each_value = /*navOptions*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if ((!current || dirty & /*selected*/ 2) && t2_value !== (t2_value = /*selected*/ ctx[1].page + "")) set_data_dev(t2, t2_value);

    			if (dirty & /*selected*/ 2 && safe_not_equal(previous_key, previous_key = /*selected*/ ctx[1].page)) {
    				group_outros();
    				transition_out(key_block, 1, 1, noop);
    				check_outros();
    				key_block = create_key_block(ctx);
    				key_block.c();
    				transition_in(key_block);
    				key_block.m(div0, null);
    			} else {
    				key_block.p(ctx, dirty);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(key_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(key_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(link);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div3);
    			destroy_each(each_blocks, detaching);
    			key_block.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(67:0) {#if navOptions.length>0}",
    		ctx
    	});

    	return block;
    }

    // (73:3) {#each navOptions as option, i}
    function create_each_block(ctx) {
    	let li;
    	let button;
    	let t0_value = /*option*/ ctx[6].page + "";
    	let t0;
    	let button_class_value;
    	let t1;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			li = element("li");
    			button = element("button");
    			t0 = text(t0_value);
    			t1 = space();

    			attr_dev(button, "class", button_class_value = /*intSelected*/ ctx[2] == /*i*/ ctx[8]
    			? "nav-link active p-2 ml-1"
    			: "p-2 ml-1 nav-link");

    			attr_dev(button, "id", /*i*/ ctx[8]);
    			attr_dev(button, "role", "tab");
    			add_location(button, file, 74, 4, 1972);
    			attr_dev(li, "class", "nav-item");
    			add_location(li, file, 73, 3, 1946);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, button);
    			append_dev(button, t0);
    			append_dev(li, t1);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*changeComponent*/ ctx[3], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*navOptions*/ 1 && t0_value !== (t0_value = /*option*/ ctx[6].page + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*intSelected*/ 4 && button_class_value !== (button_class_value = /*intSelected*/ ctx[2] == /*i*/ ctx[8]
    			? "nav-link active p-2 ml-1"
    			: "p-2 ml-1 nav-link")) {
    				attr_dev(button, "class", button_class_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(73:3) {#each navOptions as option, i}",
    		ctx
    	});

    	return block;
    }

    // (85:5) {#key selected.page}
    function create_key_block(ctx) {
    	let course;
    	let current;

    	course = new Course({
    			props: { course: /*selected*/ ctx[1].page },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(course.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(course, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const course_changes = {};
    			if (dirty & /*selected*/ 2) course_changes.course = /*selected*/ ctx[1].page;
    			course.$set(course_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(course.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(course.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(course, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_key_block.name,
    		type: "key",
    		source: "(85:5) {#key selected.page}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*navOptions*/ ctx[0].length > 0 && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*navOptions*/ ctx[0].length > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*navOptions*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Dashboard", slots, []);
    	var courses;
    	var course_titles = [];
    	var navOptions = [];
    	let selected;
    	let intSelected = 0; // selected page index

    	onMount(async () => {
    		let api;

    		api_key.subscribe(value => {
    			api = value;
    		});

    		var raw = JSON.stringify({ "Authorization": api });
    		var myHeaders = new Headers();
    		myHeaders.append("Content-Type", "application/json");

    		var requestOptions = {
    			method: "POST",
    			headers: myHeaders,
    			redirect: "follow",
    			body: raw
    		};

    		await fetch("http://localhost:3000/courses", requestOptions).then(response => response.json()).then(result => {
    			courses = result.data.unarchived_courses;

    			for (let i = 0; i < courses.length; i++) {
    				course_titles.push(courses[i].title);
    				course_titles = course_titles;
    			}
    		}).catch(error => console.log("error", error));

    		for (let i = 0; i < courses.length; i++) {
    			let new_page = {
    				page: course_titles[i],
    				component: Course,
    				props: { course: course_titles[i] }
    			};

    			navOptions.push(new_page);
    			$$invalidate(0, navOptions);
    		}

    		$$invalidate(1, selected = navOptions[0]); // keep track of the selected 'page' object (default to the about component since we must have local db connection established first)
    	});

    	// change the selected component (the event.originalTarget.id is not accessible in Chrome so switched to event.srcElement.id)
    	function changeComponent(event) {
    		console.log("Change component");
    		$$invalidate(1, selected = navOptions[event.srcElement.id]);
    		$$invalidate(2, intSelected = event.srcElement.id);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<Dashboard> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		onMount,
    		api_key,
    		Course,
    		courses,
    		course_titles,
    		navOptions,
    		selected,
    		intSelected,
    		changeComponent
    	});

    	$$self.$inject_state = $$props => {
    		if ("courses" in $$props) courses = $$props.courses;
    		if ("course_titles" in $$props) course_titles = $$props.course_titles;
    		if ("navOptions" in $$props) $$invalidate(0, navOptions = $$props.navOptions);
    		if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
    		if ("intSelected" in $$props) $$invalidate(2, intSelected = $$props.intSelected);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [navOptions, selected, intSelected, changeComponent];
    }

    class Dashboard extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dashboard",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* webviews/components/Sidebar.svelte generated by Svelte v3.38.2 */

    // (8:0) {:else }
    function create_else_block(ctx) {
    	let logincomponent;
    	let current;
    	logincomponent = new LoginComponent({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(logincomponent.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(logincomponent, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(logincomponent.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(logincomponent.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(logincomponent, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(8:0) {:else }",
    		ctx
    	});

    	return block;
    }

    // (6:0) {#if $store != null }
    function create_if_block(ctx) {
    	let afterlogin;
    	let current;
    	afterlogin = new Dashboard({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(afterlogin.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(afterlogin, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(afterlogin.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(afterlogin.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(afterlogin, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(6:0) {#if $store != null }",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$store*/ ctx[0] != null) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $store;
    	validate_store(store, "store");
    	component_subscribe($$self, store, $$value => $$invalidate(0, $store = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Sidebar", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Sidebar> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		LoginComponent,
    		AfterLogin: Dashboard,
    		store,
    		$store
    	});

    	return [$store];
    }

    class Sidebar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Sidebar",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new Sidebar({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=sidebar.js.map
