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
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
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
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function compute_rest_props(props, keys) {
        const rest = {};
        keys = new Set(keys);
        for (const k in props)
            if (!keys.has(k) && k[0] !== '$')
                rest[k] = props[k];
        return rest;
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
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
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
    const username_store = writable(0);
    // export const api_key = writable(0);

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
    	  
    	var isCorrect = false;

    	await fetch("http://localhost:3000/token", requestOptions)
    		.then(response => response.text())
    		.then(result => {
    			// eslint-disable-next-line @typescript-eslint/naming-convention
    			var data_json = JSON.parse(result);
    			if (data_json.status === 'success') {
    				api_key.set(data_json.data.token);

    				isCorrect = true;
    			}
    		})
    		.catch(error => console.log('error', error));

    	if (isCorrect===true) {
    		return 1;
    	}

    };

    /* webviews/components/Login.svelte generated by Svelte v3.55.1 */

    const { console: console_1$3 } = globals;
    const file$3 = "webviews/components/Login.svelte";

    function create_fragment$4(ctx) {
    	let link;
    	let t0;
    	let div6;
    	let div0;
    	let h10;
    	let img;
    	let img_src_value;
    	let t1;
    	let t2;
    	let div1;
    	let h11;
    	let t4;
    	let div4;
    	let form;
    	let div2;
    	let label0;
    	let t6;
    	let input0;
    	let t7;
    	let div3;
    	let label1;
    	let t9;
    	let input1;
    	let t10;
    	let button;
    	let t12;
    	let div5;
    	let small;
    	let t13;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			link = element("link");
    			t0 = space();
    			div6 = element("div");
    			div0 = element("div");
    			h10 = element("h1");
    			img = element("img");
    			t1 = text(" hey");
    			t2 = space();
    			div1 = element("div");
    			h11 = element("h1");
    			h11.textContent = "Submitty Extension";
    			t4 = space();
    			div4 = element("div");
    			form = element("form");
    			div2 = element("div");
    			label0 = element("label");
    			label0.textContent = "Username";
    			t6 = space();
    			input0 = element("input");
    			t7 = space();
    			div3 = element("div");
    			label1 = element("label");
    			label1.textContent = "Password";
    			t9 = space();
    			input1 = element("input");
    			t10 = space();
    			button = element("button");
    			button.textContent = "Submit";
    			t12 = space();
    			div5 = element("div");
    			small = element("small");
    			t13 = text(/*error*/ ctx[2]);
    			attr_dev(link, "rel", "stylesheet");
    			attr_dev(link, "href", "https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css");
    			add_location(link, file$3, 29, 0, 597);
    			if (!src_url_equal(img.src, img_src_value = "img/submitty_logo.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "...");
    			attr_dev(img, "height", "36");
    			add_location(img, file$3, 34, 6, 743);
    			add_location(h10, file$3, 34, 2, 739);
    			add_location(div0, file$3, 33, 1, 731);
    			attr_dev(h11, "class", "app-title");
    			add_location(h11, file$3, 38, 2, 827);
    			add_location(div1, file$3, 37, 1, 819);
    			attr_dev(label0, "for", "username");
    			add_location(label0, file$3, 44, 3, 963);
    			attr_dev(input0, "type", "username");
    			attr_dev(input0, "class", "form-control");
    			attr_dev(input0, "id", "username");
    			attr_dev(input0, "aria-describedby", "emailHelp");
    			attr_dev(input0, "placeholder", "Username");
    			add_location(input0, file$3, 45, 3, 1005);
    			attr_dev(div2, "class", "form-group");
    			add_location(div2, file$3, 43, 3, 935);
    			attr_dev(label1, "for", "password");
    			add_location(label1, file$3, 48, 3, 1179);
    			attr_dev(input1, "type", "password");
    			attr_dev(input1, "class", "form-control");
    			attr_dev(input1, "id", "password");
    			attr_dev(input1, "placeholder", "Password");
    			add_location(input1, file$3, 49, 3, 1221);
    			attr_dev(div3, "class", "form-group");
    			add_location(div3, file$3, 47, 3, 1151);
    			attr_dev(button, "type", "submit");
    			attr_dev(button, "class", "btn btn-primary");
    			add_location(button, file$3, 51, 3, 1338);
    			add_location(form, file$3, 42, 2, 892);
    			add_location(div4, file$3, 41, 1, 884);
    			add_location(small, file$3, 56, 2, 1429);
    			add_location(div5, file$3, 55, 1, 1421);
    			attr_dev(div6, "class", "vstack gap-3");
    			add_location(div6, file$3, 31, 0, 702);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, link, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div6, anchor);
    			append_dev(div6, div0);
    			append_dev(div0, h10);
    			append_dev(h10, img);
    			append_dev(h10, t1);
    			append_dev(div6, t2);
    			append_dev(div6, div1);
    			append_dev(div1, h11);
    			append_dev(div6, t4);
    			append_dev(div6, div4);
    			append_dev(div4, form);
    			append_dev(form, div2);
    			append_dev(div2, label0);
    			append_dev(div2, t6);
    			append_dev(div2, input0);
    			set_input_value(input0, /*username*/ ctx[0]);
    			append_dev(form, t7);
    			append_dev(form, div3);
    			append_dev(div3, label1);
    			append_dev(div3, t9);
    			append_dev(div3, input1);
    			set_input_value(input1, /*password*/ ctx[1]);
    			append_dev(form, t10);
    			append_dev(form, button);
    			append_dev(div6, t12);
    			append_dev(div6, div5);
    			append_dev(div5, small);
    			append_dev(small, t13);

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
    			if (dirty & /*username*/ 1) {
    				set_input_value(input0, /*username*/ ctx[0]);
    			}

    			if (dirty & /*password*/ 2 && input1.value !== /*password*/ ctx[1]) {
    				set_input_value(input1, /*password*/ ctx[1]);
    			}

    			if (dirty & /*error*/ 4) set_data_dev(t13, /*error*/ ctx[2]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(link);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div6);
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
    	validate_store(store, 'store');
    	component_subscribe($$self, store, $$value => $$invalidate(6, $store = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Login', slots, []);
    	let username = '';
    	let password = '';
    	let error = '';

    	async function login() {
    		const user = await getUserDetails(username, password);

    		if (user) {
    			console.log(user);
    			set_store_value(store, $store = user, $store);
    			username_store.set(username);
    			if (error) $$invalidate(2, error = '');
    		} else {
    			$$invalidate(2, error = 'Incorrect username and password.');
    			console.log("Incorrect username and password.");
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$3.warn(`<Login> was created with unknown prop '${key}'`);
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
    		username_store,
    		username,
    		password,
    		error,
    		login,
    		$store
    	});

    	$$self.$inject_state = $$props => {
    		if ('username' in $$props) $$invalidate(0, username = $$props.username);
    		if ('password' in $$props) $$invalidate(1, password = $$props.password);
    		if ('error' in $$props) $$invalidate(2, error = $$props.error);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [username, password, error, login, input0_input_handler, input1_input_handler];
    }

    class Login extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Login",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* webviews/components/Gradeable.svelte generated by Svelte v3.55.1 */

    const { console: console_1$2 } = globals;
    const file$2 = "webviews/components/Gradeable.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[12] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	return child_ctx;
    }

    // (119:12) {#if files}
    function create_if_block_3(ctx) {
    	let h2;
    	let t1;
    	let each_1_anchor;
    	let each_value_1 = Array.from(/*files*/ ctx[3]);
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
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
    			add_location(h2, file$2, 119, 16, 3569);
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
    			if (dirty & /*Array, files*/ 8) {
    				each_value_1 = Array.from(/*files*/ ctx[3]);
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
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
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(119:12) {#if files}",
    		ctx
    	});

    	return block;
    }

    // (121:16) {#each Array.from(files) as file}
    function create_each_block_1(ctx) {
    	let p;
    	let t0_value = /*file*/ ctx[15].name + "";
    	let t0;
    	let t1;
    	let t2_value = /*file*/ ctx[15].size + "";
    	let t2;
    	let t3;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t0 = text(t0_value);
    			t1 = text(" (");
    			t2 = text(t2_value);
    			t3 = text(" bytes)");
    			add_location(p, file$2, 121, 20, 3664);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t0);
    			append_dev(p, t1);
    			append_dev(p, t2);
    			append_dev(p, t3);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*files*/ 8 && t0_value !== (t0_value = /*file*/ ctx[15].name + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*files*/ 8 && t2_value !== (t2_value = /*file*/ ctx[15].size + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(121:16) {#each Array.from(files) as file}",
    		ctx
    	});

    	return block;
    }

    // (168:4) {:else}
    function create_else_block$1(ctx) {
    	let p;
    	let t0;
    	let t1;
    	let t2;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t0 = text("No submission for ");
    			t1 = text(/*gradeable*/ ctx[0]);
    			t2 = text(" so far");
    			attr_dev(p, "class", "fs-2");
    			add_location(p, file$2, 168, 8, 5203);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t0);
    			append_dev(p, t1);
    			append_dev(p, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*gradeable*/ 1) set_data_dev(t1, /*gradeable*/ ctx[0]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(168:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (144:40) 
    function create_if_block_2(ctx) {
    	let div1;
    	let p;
    	let t0;
    	let t1;
    	let t2;
    	let div0;
    	let table;
    	let thead;
    	let tr;
    	let th0;
    	let t4;
    	let th1;
    	let t6;
    	let tbody;
    	let each_value = /*gradeableResults*/ ctx[5];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			p = element("p");
    			t0 = text("Version results for ");
    			t1 = text(/*gradeable*/ ctx[0]);
    			t2 = space();
    			div0 = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th0 = element("th");
    			th0.textContent = "Version";
    			t4 = space();
    			th1 = element("th");
    			th1.textContent = "Grade (%)";
    			t6 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(p, "class", "fs-2");
    			add_location(p, file$2, 146, 12, 4398);
    			attr_dev(th0, "scope", "col");
    			add_location(th0, file$2, 152, 28, 4655);
    			attr_dev(th1, "scope", "col");
    			add_location(th1, file$2, 153, 28, 4712);
    			add_location(tr, file$2, 151, 24, 4622);
    			add_location(thead, file$2, 150, 20, 4590);
    			add_location(tbody, file$2, 156, 20, 4822);
    			attr_dev(table, "class", "table table-hover");
    			add_location(table, file$2, 149, 16, 4536);
    			attr_dev(div0, "class", "table-wrapper-scroll-y my-custom-scrollbar svelte-zfsjrg");
    			add_location(div0, file$2, 148, 12, 4463);
    			attr_dev(div1, "class", "bg-light border rounded-3");
    			add_location(div1, file$2, 144, 8, 4345);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, p);
    			append_dev(p, t0);
    			append_dev(p, t1);
    			append_dev(div1, t2);
    			append_dev(div1, div0);
    			append_dev(div0, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th0);
    			append_dev(tr, t4);
    			append_dev(tr, th1);
    			append_dev(table, t6);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*gradeable*/ 1) set_data_dev(t1, /*gradeable*/ ctx[0]);

    			if (dirty & /*gradeableResults*/ 32) {
    				each_value = /*gradeableResults*/ ctx[5];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(144:40) ",
    		ctx
    	});

    	return block;
    }

    // (142:31) 
    function create_if_block_1(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "This is a team submission, results on web application";
    			attr_dev(p, "class", "fs-2");
    			add_location(p, file$2, 142, 8, 4222);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(142:31) ",
    		ctx
    	});

    	return block;
    }

    // (140:4) {#if submissionClosed}
    function create_if_block$3(ctx) {
    	let p;

    	const block = {
    		c: function create() {
    			p = element("p");
    			p.textContent = "Submission is closed, go to web application for results";
    			attr_dev(p, "class", "fs-2");
    			add_location(p, file$2, 140, 8, 4106);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(140:4) {#if submissionClosed}",
    		ctx
    	});

    	return block;
    }

    // (158:20) {#each gradeableResults as result}
    function create_each_block$2(ctx) {
    	let tr;
    	let th;
    	let t0_value = /*result*/ ctx[12].version + "";
    	let t0;
    	let t1;
    	let td;
    	let t2_value = /*result*/ ctx[12].result + "";
    	let t2;
    	let t3;

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			th = element("th");
    			t0 = text(t0_value);
    			t1 = space();
    			td = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			attr_dev(th, "scope", "row");
    			add_location(th, file$2, 159, 28, 4942);
    			add_location(td, file$2, 160, 28, 5008);
    			add_location(tr, file$2, 158, 24, 4909);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, th);
    			append_dev(th, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td);
    			append_dev(td, t2);
    			append_dev(tr, t3);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*gradeableResults*/ 32 && t0_value !== (t0_value = /*result*/ ctx[12].version + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*gradeableResults*/ 32 && t2_value !== (t2_value = /*result*/ ctx[12].result + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(158:20) {#each gradeableResults as result}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let link;
    	let t0;
    	let button0;
    	let t2;
    	let div5;
    	let div4;
    	let p;
    	let t3;
    	let t4;
    	let t5;
    	let div0;
    	let input;
    	let t6;
    	let div1;
    	let t7;
    	let div3;
    	let button1;
    	let t9;
    	let div2;
    	let t10;
    	let t11;
    	let t12;
    	let t13;
    	let mounted;
    	let dispose;
    	let if_block0 = /*files*/ ctx[3] && create_if_block_3(ctx);

    	function select_block_type(ctx, dirty) {
    		if (/*submissionClosed*/ ctx[1]) return create_if_block$3;
    		if (/*isTeamAssignment*/ ctx[2]) return create_if_block_1;
    		if (/*gradeableResults*/ ctx[5].length > 0) return create_if_block_2;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block1 = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			link = element("link");
    			t0 = space();
    			button0 = element("button");
    			button0.textContent = "Show Diff";
    			t2 = space();
    			div5 = element("div");
    			div4 = element("div");
    			p = element("p");
    			t3 = text("Upload files to ");
    			t4 = text(/*gradeable*/ ctx[0]);
    			t5 = space();
    			div0 = element("div");
    			input = element("input");
    			t6 = space();
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t7 = space();
    			div3 = element("div");
    			button1 = element("button");
    			button1.textContent = "Submit";
    			t9 = space();
    			div2 = element("div");
    			t10 = text(/*response*/ ctx[4]);
    			t11 = space();
    			t12 = text(/*isTeamAssignment*/ ctx[2]);
    			t13 = space();
    			if_block1.c();
    			attr_dev(link, "href", "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css");
    			attr_dev(link, "rel", "stylesheet");
    			attr_dev(link, "integrity", "sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3");
    			attr_dev(link, "crossorigin", "anonymous");
    			add_location(link, file$2, 98, 0, 2871);
    			attr_dev(button0, "type", "button");
    			attr_dev(button0, "class", "btn btn-primary ");
    			add_location(button0, file$2, 100, 0, 3083);
    			attr_dev(p, "class", "fs-2");
    			add_location(p, file$2, 107, 8, 3287);
    			attr_dev(input, "id", "folder-opener");
    			input.multiple = true;
    			attr_dev(input, "type", "file");
    			add_location(input, file$2, 110, 12, 3383);
    			attr_dev(div0, "class", "vstack gap-3");
    			add_location(div0, file$2, 109, 8, 3344);
    			add_location(div1, file$2, 117, 8, 3523);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "class", "btn btn-primary ");
    			add_location(button1, file$2, 127, 12, 3834);
    			add_location(div2, file$2, 130, 12, 3967);
    			attr_dev(div3, "class", "d-grid gap-2 col-6 text-center");
    			add_location(div3, file$2, 126, 8, 3777);
    			attr_dev(div4, "class", "vstack gap-3 bg-light border rounded-3");
    			add_location(div4, file$2, 106, 4, 3226);
    			attr_dev(div5, "class", "vstack gap-3 position-relative");
    			add_location(div5, file$2, 105, 0, 3177);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, link, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, p);
    			append_dev(p, t3);
    			append_dev(p, t4);
    			append_dev(div4, t5);
    			append_dev(div4, div0);
    			append_dev(div0, input);
    			append_dev(div4, t6);
    			append_dev(div4, div1);
    			if (if_block0) if_block0.m(div1, null);
    			append_dev(div4, t7);
    			append_dev(div4, div3);
    			append_dev(div3, button1);
    			append_dev(div3, t9);
    			append_dev(div3, div2);
    			append_dev(div2, t10);
    			append_dev(div5, t11);
    			append_dev(div5, t12);
    			append_dev(div5, t13);
    			if_block1.m(div5, null);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", showDiff, false, false, false),
    					listen_dev(input, "change", /*input_change_handler*/ ctx[10]),
    					listen_dev(button1, "click", /*submitToSubmitty*/ ctx[6], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*gradeable*/ 1) set_data_dev(t4, /*gradeable*/ ctx[0]);

    			if (/*files*/ ctx[3]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					if_block0.m(div1, null);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*response*/ 16) set_data_dev(t10, /*response*/ ctx[4]);
    			if (dirty & /*isTeamAssignment*/ 4) set_data_dev(t12, /*isTeamAssignment*/ ctx[2]);

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block1) {
    				if_block1.p(ctx, dirty);
    			} else {
    				if_block1.d(1);
    				if_block1 = current_block_type(ctx);

    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(div5, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(link);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(div5);
    			if (if_block0) if_block0.d();
    			if_block1.d();
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

    function showDiff() {
    	// vscode.commands.executeCommand('code --diff hi.txt hi1.txt');
    	console.log("hi");
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Gradeable', slots, []);
    	let { gradeable } = $$props;
    	let { semester } = $$props;
    	let { course } = $$props;
    	let { id } = $$props;
    	let { submissionClosed } = $$props;
    	let { isTeamAssignment } = $$props;
    	var response = "";

    	// let files: ArrayLike<unknown> | Iterable<unknown>;
    	let files;

    	let gradeableResults = [];

    	function submitToSubmitty() {
    		// let api : string|Number;
    		// api_key.subscribe(value => {
    		//     api = value;
    		// });
    		var api = get_store_value(api_key);

    		// let user_id;
    		// username_store.subscribe(value => {
    		//     user_id = value;
    		// });
    		const user_id = get_store_value(username_store);

    		var formdata = new FormData();

    		// formdata.append("Authorization", api);
    		// formdata.append("User_id", user_id);
    		formdata.append("Authorization", api);

    		formdata.append("User_id", user_id);
    		formdata.append("previous_files", "");
    		formdata.append("Semester", semester);
    		formdata.append("Course", course);
    		formdata.append("Gradeable", id);
    		formdata.append("files", files[0], files[0].name);

    		var requestOptions = {
    			method: 'POST',
    			body: formdata,
    			redirect: 'follow'
    		};

    		fetch("http://localhost:3000/submit", requestOptions).then(response => response.json()).then(result => {
    			$$invalidate(4, response = result.data);
    		}).catch(error => console.log('error', error));
    	}

    	function getGradeableResults() {
    		let api;

    		api_key.subscribe(value => {
    			api = value;
    		});

    		var raw = JSON.stringify({
    			"Authorization": api,
    			course,
    			semester,
    			"gradeable": id
    		});

    		var myHeaders = new Headers();
    		myHeaders.append("Content-Type", "application/json");

    		var requestOptions = {
    			method: 'POST',
    			headers: myHeaders,
    			body: raw,
    			redirect: 'follow'
    		};

    		fetch("http://localhost:3000/gradeableResults", requestOptions).then(response => response.json()).then(result => {
    			if (result.status == "success") {
    				$$invalidate(5, gradeableResults = result["data"].reverse());
    			} else {
    				return;
    			}
    		}).catch(error => console.log('error', error));
    	}

    	$$self.$$.on_mount.push(function () {
    		if (gradeable === undefined && !('gradeable' in $$props || $$self.$$.bound[$$self.$$.props['gradeable']])) {
    			console_1$2.warn("<Gradeable> was created without expected prop 'gradeable'");
    		}

    		if (semester === undefined && !('semester' in $$props || $$self.$$.bound[$$self.$$.props['semester']])) {
    			console_1$2.warn("<Gradeable> was created without expected prop 'semester'");
    		}

    		if (course === undefined && !('course' in $$props || $$self.$$.bound[$$self.$$.props['course']])) {
    			console_1$2.warn("<Gradeable> was created without expected prop 'course'");
    		}

    		if (id === undefined && !('id' in $$props || $$self.$$.bound[$$self.$$.props['id']])) {
    			console_1$2.warn("<Gradeable> was created without expected prop 'id'");
    		}

    		if (submissionClosed === undefined && !('submissionClosed' in $$props || $$self.$$.bound[$$self.$$.props['submissionClosed']])) {
    			console_1$2.warn("<Gradeable> was created without expected prop 'submissionClosed'");
    		}

    		if (isTeamAssignment === undefined && !('isTeamAssignment' in $$props || $$self.$$.bound[$$self.$$.props['isTeamAssignment']])) {
    			console_1$2.warn("<Gradeable> was created without expected prop 'isTeamAssignment'");
    		}
    	});

    	const writable_props = [
    		'gradeable',
    		'semester',
    		'course',
    		'id',
    		'submissionClosed',
    		'isTeamAssignment'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$2.warn(`<Gradeable> was created with unknown prop '${key}'`);
    	});

    	function input_change_handler() {
    		files = this.files;
    		$$invalidate(3, files);
    	}

    	$$self.$$set = $$props => {
    		if ('gradeable' in $$props) $$invalidate(0, gradeable = $$props.gradeable);
    		if ('semester' in $$props) $$invalidate(7, semester = $$props.semester);
    		if ('course' in $$props) $$invalidate(8, course = $$props.course);
    		if ('id' in $$props) $$invalidate(9, id = $$props.id);
    		if ('submissionClosed' in $$props) $$invalidate(1, submissionClosed = $$props.submissionClosed);
    		if ('isTeamAssignment' in $$props) $$invalidate(2, isTeamAssignment = $$props.isTeamAssignment);
    	};

    	$$self.$capture_state = () => ({
    		gradeable,
    		semester,
    		course,
    		id,
    		submissionClosed,
    		isTeamAssignment,
    		api_key,
    		get: get_store_value,
    		username_store,
    		response,
    		files,
    		gradeableResults,
    		showDiff,
    		submitToSubmitty,
    		getGradeableResults
    	});

    	$$self.$inject_state = $$props => {
    		if ('gradeable' in $$props) $$invalidate(0, gradeable = $$props.gradeable);
    		if ('semester' in $$props) $$invalidate(7, semester = $$props.semester);
    		if ('course' in $$props) $$invalidate(8, course = $$props.course);
    		if ('id' in $$props) $$invalidate(9, id = $$props.id);
    		if ('submissionClosed' in $$props) $$invalidate(1, submissionClosed = $$props.submissionClosed);
    		if ('isTeamAssignment' in $$props) $$invalidate(2, isTeamAssignment = $$props.isTeamAssignment);
    		if ('response' in $$props) $$invalidate(4, response = $$props.response);
    		if ('files' in $$props) $$invalidate(3, files = $$props.files);
    		if ('gradeableResults' in $$props) $$invalidate(5, gradeableResults = $$props.gradeableResults);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*submissionClosed, isTeamAssignment*/ 6) {
    			// $: if (!results.submissionClosed && !results.isTeamAssignment) {
    			if (!submissionClosed && !isTeamAssignment) {
    				getGradeableResults();
    			}
    		}

    		if ($$self.$$.dirty & /*files*/ 8) {
    			if (files) {
    				// Note that `files` is of type `FileList`, not an Array:
    				// https://developer.mozilla.org/en-US/docs/Web/API/FileList
    				console.log(files);
    			} // for (const file of files) {
    			// 	console.log(`${file.name}: ${file.size} bytes`);
    			// }
    		}
    	};

    	return [
    		gradeable,
    		submissionClosed,
    		isTeamAssignment,
    		files,
    		response,
    		gradeableResults,
    		submitToSubmitty,
    		semester,
    		course,
    		id,
    		input_change_handler
    	];
    }

    class Gradeable extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			gradeable: 0,
    			semester: 7,
    			course: 8,
    			id: 9,
    			submissionClosed: 1,
    			isTeamAssignment: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Gradeable",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get gradeable() {
    		throw new Error("<Gradeable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set gradeable(value) {
    		throw new Error("<Gradeable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get semester() {
    		throw new Error("<Gradeable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set semester(value) {
    		throw new Error("<Gradeable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get course() {
    		throw new Error("<Gradeable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set course(value) {
    		throw new Error("<Gradeable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Gradeable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Gradeable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get submissionClosed() {
    		throw new Error("<Gradeable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set submissionClosed(value) {
    		throw new Error("<Gradeable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isTeamAssignment() {
    		throw new Error("<Gradeable>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isTeamAssignment(value) {
    		throw new Error("<Gradeable>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews/components/Course.svelte generated by Svelte v3.55.1 */

    const { Object: Object_1$1, console: console_1$1 } = globals;
    const file$1 = "webviews/components/Course.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	return child_ctx;
    }

    // (79:0) {#if gradeable_infos.length>0}
    function create_if_block$2(ctx) {
    	let div2;
    	let div0;
    	let p;
    	let t1;
    	let select;
    	let t2;
    	let div1;
    	let previous_key = /*unique*/ ctx[3];
    	let t3;
    	let button;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*gradeable_infos*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	let key_block = create_key_block$1(ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			p = element("p");
    			p.textContent = "Select Gradeable";
    			t1 = space();
    			select = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			div1 = element("div");
    			key_block.c();
    			t3 = space();
    			button = element("button");
    			button.textContent = "Restart";
    			attr_dev(p, "class", "fw-light");
    			add_location(p, file$1, 82, 3, 2119);
    			attr_dev(select, "class", "form-select");
    			attr_dev(select, "aria-label", "Select Gradeable");
    			if (/*selected*/ ctx[2] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[5].call(select));
    			add_location(select, file$1, 83, 3, 2163);
    			attr_dev(div0, "class", "bg-light border rounded-3");
    			add_location(div0, file$1, 81, 2, 2076);
    			attr_dev(button, "class", "float-right");
    			add_location(button, file$1, 98, 3, 2642);
    			add_location(div1, file$1, 92, 2, 2378);
    			attr_dev(div2, "class", "vstack gap-3");
    			add_location(div2, file$1, 79, 1, 2046);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div0, p);
    			append_dev(div0, t1);
    			append_dev(div0, select);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, /*selected*/ ctx[2]);
    			append_dev(div2, t2);
    			append_dev(div2, div1);
    			key_block.m(div1, null);
    			append_dev(div1, t3);
    			append_dev(div1, button);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(select, "change", /*select_change_handler*/ ctx[5]),
    					listen_dev(button, "click", /*restart*/ ctx[4], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*gradeable_infos*/ 2) {
    				each_value = /*gradeable_infos*/ ctx[1];
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

    			if (dirty & /*selected, gradeable_infos*/ 6) {
    				select_option(select, /*selected*/ ctx[2]);
    			}

    			if (dirty & /*unique*/ 8 && safe_not_equal(previous_key, previous_key = /*unique*/ ctx[3])) {
    				group_outros();
    				transition_out(key_block, 1, 1, noop);
    				check_outros();
    				key_block = create_key_block$1(ctx);
    				key_block.c();
    				transition_in(key_block, 1);
    				key_block.m(div1, t3);
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
    			if (detaching) detach_dev(div2);
    			destroy_each(each_blocks, detaching);
    			key_block.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(79:0) {#if gradeable_infos.length>0}",
    		ctx
    	});

    	return block;
    }

    // (85:4) {#each gradeable_infos as info}
    function create_each_block$1(ctx) {
    	let option;
    	let t0_value = /*info*/ ctx[7].title + "";
    	let t0;
    	let t1;
    	let option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t0 = text(t0_value);
    			t1 = space();
    			option.__value = option_value_value = /*info*/ ctx[7];
    			option.value = option.__value;
    			add_location(option, file$1, 85, 5, 2285);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t0);
    			append_dev(option, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*gradeable_infos*/ 2 && t0_value !== (t0_value = /*info*/ ctx[7].title + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*gradeable_infos*/ 2 && option_value_value !== (option_value_value = /*info*/ ctx[7])) {
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
    		source: "(85:4) {#each gradeable_infos as info}",
    		ctx
    	});

    	return block;
    }

    // (95:4) {#key selected}
    function create_key_block_1(ctx) {
    	let gradeable;
    	let current;

    	gradeable = new Gradeable({
    			props: {
    				gradeable: /*selected*/ ctx[2].title,
    				semester: /*selected*/ ctx[2].semester,
    				course: /*course*/ ctx[0],
    				id: /*selected*/ ctx[2].id,
    				submissionClosed: /*selected*/ ctx[2].submissionClosed,
    				isTeamAssignment: /*selected*/ ctx[2].isTeamAssignment
    			},
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
    			if (dirty & /*selected*/ 4) gradeable_changes.gradeable = /*selected*/ ctx[2].title;
    			if (dirty & /*selected*/ 4) gradeable_changes.semester = /*selected*/ ctx[2].semester;
    			if (dirty & /*course*/ 1) gradeable_changes.course = /*course*/ ctx[0];
    			if (dirty & /*selected*/ 4) gradeable_changes.id = /*selected*/ ctx[2].id;
    			if (dirty & /*selected*/ 4) gradeable_changes.submissionClosed = /*selected*/ ctx[2].submissionClosed;
    			if (dirty & /*selected*/ 4) gradeable_changes.isTeamAssignment = /*selected*/ ctx[2].isTeamAssignment;
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
    		id: create_key_block_1.name,
    		type: "key",
    		source: "(95:4) {#key selected}",
    		ctx
    	});

    	return block;
    }

    // (94:3) {#key unique}
    function create_key_block$1(ctx) {
    	let previous_key = /*selected*/ ctx[2];
    	let key_block_anchor;
    	let current;
    	let key_block = create_key_block_1(ctx);

    	const block = {
    		c: function create() {
    			key_block.c();
    			key_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			key_block.m(target, anchor);
    			insert_dev(target, key_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*selected*/ 4 && safe_not_equal(previous_key, previous_key = /*selected*/ ctx[2])) {
    				group_outros();
    				transition_out(key_block, 1, 1, noop);
    				check_outros();
    				key_block = create_key_block_1(ctx);
    				key_block.c();
    				transition_in(key_block, 1);
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
    			if (detaching) detach_dev(key_block_anchor);
    			key_block.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_key_block$1.name,
    		type: "key",
    		source: "(94:3) {#key unique}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let link;
    	let t;
    	let if_block_anchor;
    	let current;
    	let if_block = /*gradeable_infos*/ ctx[1].length > 0 && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			link = element("link");
    			t = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(link, "href", "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css");
    			attr_dev(link, "rel", "stylesheet");
    			attr_dev(link, "integrity", "sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3");
    			attr_dev(link, "crossorigin", "anonymous");
    			add_location(link, file$1, 76, 0, 1802);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, link, anchor);
    			insert_dev(target, t, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*gradeable_infos*/ ctx[1].length > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*gradeable_infos*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
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
    			if (detaching) detach_dev(link);
    			if (detaching) detach_dev(t);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
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
    	validate_slots('Course', slots, []);
    	let { course } = $$props;
    	var gradeables;
    	var gradeable_infos = [];
    	let selected;
    	let unique = {}; // every {} is unique, {} === {} evaluates to false

    	function restart() {
    		$$invalidate(3, unique = {});
    	}

    	onMount(async () => {
    		let api;

    		api_key.subscribe(value => {
    			api = value;
    		});

    		var raw = JSON.stringify({ "Authorization": api, course });
    		var myHeaders = new Headers();
    		myHeaders.append("Content-Type", "application/json");

    		var requestOptions = {
    			method: 'POST',
    			headers: myHeaders,
    			redirect: 'follow',
    			body: raw
    		};

    		await fetch("http://localhost:3000/courseGradeables", requestOptions).then(response => response.json()).then(result => {
    			gradeables = result[course];

    			for (var key in gradeables) {
    				var info = new Object();
    				info['title'] = gradeables[key].title;
    				info["semester"] = gradeables[key].semester;
    				info["id"] = gradeables[key].id;

    				if (gradeables[key].submissionClosed) {
    					// result_info["submissionClosed"] = true;
    					info["submissionClosed"] = true;
    				} else {
    					// result_info["submissionClosed"] = false;
    					info["submissionClosed"] = false;
    				}

    				if (gradeables[key].isTeamAssignment) {
    					// result_info["isTeamAssignment"] = true;
    					info["isTeamAssignment"] = true;
    				} else {
    					// result_info["isTeamAssignment"] = false;
    					info["isTeamAssignment"] = false;
    				}

    				// info["results"] = result_info;
    				gradeable_infos.push(info);

    				$$invalidate(1, gradeable_infos);
    			}

    			$$invalidate(2, selected = gradeable_infos[0]);
    		}).catch(error => console.log('error', error));
    	});

    	$$self.$$.on_mount.push(function () {
    		if (course === undefined && !('course' in $$props || $$self.$$.bound[$$self.$$.props['course']])) {
    			console_1$1.warn("<Course> was created without expected prop 'course'");
    		}
    	});

    	const writable_props = ['course'];

    	Object_1$1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$1.warn(`<Course> was created with unknown prop '${key}'`);
    	});

    	function select_change_handler() {
    		selected = select_value(this);
    		$$invalidate(2, selected);
    		$$invalidate(1, gradeable_infos);
    	}

    	$$self.$$set = $$props => {
    		if ('course' in $$props) $$invalidate(0, course = $$props.course);
    	};

    	$$self.$capture_state = () => ({
    		course,
    		onMount,
    		compute_rest_props,
    		api_key,
    		Gradeable,
    		gradeables,
    		gradeable_infos,
    		selected,
    		unique,
    		restart
    	});

    	$$self.$inject_state = $$props => {
    		if ('course' in $$props) $$invalidate(0, course = $$props.course);
    		if ('gradeables' in $$props) gradeables = $$props.gradeables;
    		if ('gradeable_infos' in $$props) $$invalidate(1, gradeable_infos = $$props.gradeable_infos);
    		if ('selected' in $$props) $$invalidate(2, selected = $$props.selected);
    		if ('unique' in $$props) $$invalidate(3, unique = $$props.unique);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [course, gradeable_infos, selected, unique, restart, select_change_handler];
    }

    class Course extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { course: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Course",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get course() {
    		throw new Error("<Course>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set course(value) {
    		throw new Error("<Course>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews/components/Dashboard.svelte generated by Svelte v3.55.1 */

    const { Object: Object_1, console: console_1 } = globals;

    const file = "webviews/components/Dashboard.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	child_ctx[8] = i;
    	return child_ctx;
    }

    // (88:0) {#if navOptions.length>0}
    function create_if_block$1(ctx) {
    	let div3;
    	let ul;
    	let t0;
    	let div2;
    	let div1;
    	let div0;
    	let h1;
    	let t1_value = /*selected*/ ctx[1].page.display_title + "";
    	let t1;
    	let t2;
    	let previous_key = /*selected*/ ctx[1].page.id;
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
    			div3 = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			t1 = text(t1_value);
    			t2 = space();
    			key_block.c();
    			attr_dev(ul, "class", "nav nav-tabs");
    			add_location(ul, file, 91, 2, 2493);
    			attr_dev(h1, "class", "text-center");
    			add_location(h1, file, 102, 5, 2876);
    			attr_dev(div0, "class", "p-2");
    			add_location(div0, file, 101, 4, 2853);
    			attr_dev(div1, "class", "col-sm-12");
    			add_location(div1, file, 100, 3, 2825);
    			attr_dev(div2, "class", "row");
    			add_location(div2, file, 99, 2, 2804);
    			attr_dev(div3, "class", "container fixed-top");
    			set_style(div3, "margin-top", "20px");
    			add_location(div3, file, 89, 1, 2407);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			append_dev(div3, t0);
    			append_dev(div3, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, h1);
    			append_dev(h1, t1);
    			append_dev(div0, t2);
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

    			if ((!current || dirty & /*selected*/ 2) && t1_value !== (t1_value = /*selected*/ ctx[1].page.display_title + "")) set_data_dev(t1, t1_value);

    			if (dirty & /*selected*/ 2 && safe_not_equal(previous_key, previous_key = /*selected*/ ctx[1].page.id)) {
    				group_outros();
    				transition_out(key_block, 1, 1, noop);
    				check_outros();
    				key_block = create_key_block(ctx);
    				key_block.c();
    				transition_in(key_block, 1);
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
    			if (detaching) detach_dev(div3);
    			destroy_each(each_blocks, detaching);
    			key_block.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(88:0) {#if navOptions.length>0}",
    		ctx
    	});

    	return block;
    }

    // (93:3) {#each navOptions as option, i}
    function create_each_block(ctx) {
    	let li;
    	let button;
    	let t0_value = /*option*/ ctx[6].page.display_title + "";
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
    			add_location(button, file, 94, 4, 2583);
    			attr_dev(li, "class", "nav-item");
    			add_location(li, file, 93, 3, 2557);
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
    			if (dirty & /*navOptions*/ 1 && t0_value !== (t0_value = /*option*/ ctx[6].page.display_title + "")) set_data_dev(t0, t0_value);

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
    		source: "(93:3) {#each navOptions as option, i}",
    		ctx
    	});

    	return block;
    }

    // (105:5) {#key selected.page.id}
    function create_key_block(ctx) {
    	let course;
    	let current;

    	course = new Course({
    			props: { course: /*selected*/ ctx[1].page.id },
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
    			if (dirty & /*selected*/ 2) course_changes.course = /*selected*/ ctx[1].page.id;
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
    		source: "(105:5) {#key selected.page.id}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let link;
    	let t;
    	let if_block_anchor;
    	let current;
    	let if_block = /*navOptions*/ ctx[0].length > 0 && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			link = element("link");
    			t = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(link, "href", "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css");
    			attr_dev(link, "rel", "stylesheet");
    			attr_dev(link, "integrity", "sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3");
    			attr_dev(link, "crossorigin", "anonymous");
    			add_location(link, file, 85, 0, 2137);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, link, anchor);
    			insert_dev(target, t, anchor);
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
    			if (detaching) detach_dev(link);
    			if (detaching) detach_dev(t);
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

    function courseIdToTitle(course_id) {
    	let result = "";

    	for (let i in course_id) {
    		let current_char = course_id.charAt(i);

    		if (i == 0) {
    			result += current_char.toUpperCase();
    		} else if (current_char == "_") {
    			result += " ";
    		} else {
    			result += course_id.charAt(i);
    		}
    	}

    	return result;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Dashboard', slots, []);
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
    			method: 'POST',
    			headers: myHeaders,
    			redirect: 'follow',
    			body: raw
    		};

    		await fetch("http://localhost:3000/courses", requestOptions).then(response => response.json()).then(result => {
    			courses = result.data.unarchived_courses;

    			//To Do: Make title the display namen
    			for (let i = 0; i < courses.length; i++) {
    				let course = new Object();
    				course["display_title"] = courseIdToTitle(courses[i].title);
    				course["id"] = courses[i].title;
    				course_titles.push(course);
    				course_titles = course_titles;
    			}
    		}).catch(error => console.log('error', error));

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

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<Dashboard> was created with unknown prop '${key}'`);
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
    		courseIdToTitle,
    		changeComponent
    	});

    	$$self.$inject_state = $$props => {
    		if ('courses' in $$props) courses = $$props.courses;
    		if ('course_titles' in $$props) course_titles = $$props.course_titles;
    		if ('navOptions' in $$props) $$invalidate(0, navOptions = $$props.navOptions);
    		if ('selected' in $$props) $$invalidate(1, selected = $$props.selected);
    		if ('intSelected' in $$props) $$invalidate(2, intSelected = $$props.intSelected);
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

    /* webviews/components/Sidebar.svelte generated by Svelte v3.55.1 */

    // (8:0) {:else }
    function create_else_block(ctx) {
    	let logincomponent;
    	let current;
    	logincomponent = new Login({ $$inline: true });

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
    	validate_store(store, 'store');
    	component_subscribe($$self, store, $$value => $$invalidate(0, $store = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Sidebar', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Sidebar> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		LoginComponent: Login,
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
