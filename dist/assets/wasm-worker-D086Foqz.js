(async ()=>{
    var b = function() {
        return b = Object.assign || function(t) {
            for(var r, o = 1, s = arguments.length; o < s; o++){
                r = arguments[o];
                for(var n in r)Object.prototype.hasOwnProperty.call(r, n) && (t[n] = r[n]);
            }
            return t;
        }, b.apply(this, arguments);
    };
    function j(e, t, r, o) {
        function s(n) {
            return n instanceof r ? n : new r(function(c) {
                c(n);
            });
        }
        return new (r || (r = Promise))(function(n, c) {
            function u(i) {
                try {
                    a(o.next(i));
                } catch (f) {
                    c(f);
                }
            }
            function l(i) {
                try {
                    a(o.throw(i));
                } catch (f) {
                    c(f);
                }
            }
            function a(i) {
                i.done ? n(i.value) : s(i.value).then(u, l);
            }
            a((o = o.apply(e, t || [])).next());
        });
    }
    function H(e, t) {
        var r = {
            label: 0,
            sent: function() {
                if (n[0] & 1) throw n[1];
                return n[1];
            },
            trys: [],
            ops: []
        }, o, s, n, c = Object.create((typeof Iterator == "function" ? Iterator : Object).prototype);
        return c.next = u(0), c.throw = u(1), c.return = u(2), typeof Symbol == "function" && (c[Symbol.iterator] = function() {
            return this;
        }), c;
        function u(a) {
            return function(i) {
                return l([
                    a,
                    i
                ]);
            };
        }
        function l(a) {
            if (o) throw new TypeError("Generator is already executing.");
            for(; c && (c = 0, a[0] && (r = 0)), r;)try {
                if (o = 1, s && (n = a[0] & 2 ? s.return : a[0] ? s.throw || ((n = s.return) && n.call(s), 0) : s.next) && !(n = n.call(s, a[1])).done) return n;
                switch(s = 0, n && (a = [
                    a[0] & 2,
                    n.value
                ]), a[0]){
                    case 0:
                    case 1:
                        n = a;
                        break;
                    case 4:
                        return r.label++, {
                            value: a[1],
                            done: !1
                        };
                    case 5:
                        r.label++, s = a[1], a = [
                            0
                        ];
                        continue;
                    case 7:
                        a = r.ops.pop(), r.trys.pop();
                        continue;
                    default:
                        if (n = r.trys, !(n = n.length > 0 && n[n.length - 1]) && (a[0] === 6 || a[0] === 2)) {
                            r = 0;
                            continue;
                        }
                        if (a[0] === 3 && (!n || a[1] > n[0] && a[1] < n[3])) {
                            r.label = a[1];
                            break;
                        }
                        if (a[0] === 6 && r.label < n[1]) {
                            r.label = n[1], n = a;
                            break;
                        }
                        if (n && r.label < n[2]) {
                            r.label = n[2], r.ops.push(a);
                            break;
                        }
                        n[2] && r.ops.pop(), r.trys.pop();
                        continue;
                }
                a = t.call(e, r);
            } catch (i) {
                a = [
                    6,
                    i
                ], s = 0;
            } finally{
                o = n = 0;
            }
            if (a[0] & 5) throw a[1];
            return {
                value: a[0] ? a[1] : void 0,
                done: !0
            };
        }
    }
    const A = Symbol("Comlink.proxy"), I = Symbol("Comlink.endpoint"), D = Symbol("Comlink.releaseProxy"), _ = Symbol("Comlink.finalizer"), w = Symbol("Comlink.thrown"), C = (e)=>typeof e == "object" && e !== null || typeof e == "function", U = {
        canHandle: (e)=>C(e) && e[A],
        serialize (e) {
            const { port1: t, port2: r } = new MessageChannel;
            return T(e, t), [
                r,
                [
                    r
                ]
            ];
        },
        deserialize (e) {
            return e.start(), G(e);
        }
    }, V = {
        canHandle: (e)=>C(e) && w in e,
        serialize ({ value: e }) {
            let t;
            return e instanceof Error ? t = {
                isError: !0,
                value: {
                    message: e.message,
                    name: e.name,
                    stack: e.stack
                }
            } : t = {
                isError: !1,
                value: e
            }, [
                t,
                []
            ];
        },
        deserialize (e) {
            throw e.isError ? Object.assign(new Error(e.value.message), e.value) : e.value;
        }
    }, R = new Map([
        [
            "proxy",
            U
        ],
        [
            "throw",
            V
        ]
    ]);
    function F(e, t) {
        for (const r of e)if (t === r || r === "*" || r instanceof RegExp && r.test(t)) return !0;
        return !1;
    }
    function T(e, t = globalThis, r = [
        "*"
    ]) {
        t.addEventListener("message", function o(s) {
            if (!s || !s.data) return;
            if (!F(r, s.origin)) {
                console.warn(`Invalid origin '${s.origin}' for comlink proxy`);
                return;
            }
            const { id: n, type: c, path: u } = Object.assign({
                path: []
            }, s.data), l = (s.data.argumentList || []).map(g);
            let a;
            try {
                const i = u.slice(0, -1).reduce((d, y)=>d[y], e), f = u.reduce((d, y)=>d[y], e);
                switch(c){
                    case "GET":
                        a = f;
                        break;
                    case "SET":
                        i[u.slice(-1)[0]] = g(s.data.value), a = !0;
                        break;
                    case "APPLY":
                        a = f.apply(i, l);
                        break;
                    case "CONSTRUCT":
                        {
                            const d = new f(...l);
                            a = S(d);
                        }
                        break;
                    case "ENDPOINT":
                        {
                            const { port1: d, port2: y } = new MessageChannel;
                            T(e, y), a = v(d, [
                                d
                            ]);
                        }
                        break;
                    case "RELEASE":
                        a = void 0;
                        break;
                    default:
                        return;
                }
            } catch (i) {
                a = {
                    value: i,
                    [w]: 0
                };
            }
            Promise.resolve(a).catch((i)=>({
                    value: i,
                    [w]: 0
                })).then((i)=>{
                const [f, d] = k(i);
                t.postMessage(Object.assign(Object.assign({}, f), {
                    id: n
                }), d), c === "RELEASE" && (t.removeEventListener("message", o), z(t), _ in e && typeof e[_] == "function" && e[_]());
            }).catch((i)=>{
                const [f, d] = k({
                    value: new TypeError("Unserializable return value"),
                    [w]: 0
                });
                t.postMessage(Object.assign(Object.assign({}, f), {
                    id: n
                }), d);
            });
        }), t.start && t.start();
    }
    function W(e) {
        return e.constructor.name === "MessagePort";
    }
    function z(e) {
        W(e) && e.close();
    }
    function G(e, t) {
        const r = new Map;
        return e.addEventListener("message", function(s) {
            const { data: n } = s;
            if (!n || !n.id) return;
            const c = r.get(n.id);
            if (c) try {
                c(n);
            } finally{
                r.delete(n.id);
            }
        }), O(e, r, [], t);
    }
    function m(e) {
        if (e) throw new Error("Proxy has been released and is not useable");
    }
    function N(e) {
        return h(e, new Map, {
            type: "RELEASE"
        }).then(()=>{
            z(e);
        });
    }
    const p = new WeakMap, E = "FinalizationRegistry" in globalThis && new FinalizationRegistry((e)=>{
        const t = (p.get(e) || 0) - 1;
        p.set(e, t), t === 0 && N(e);
    });
    function q(e, t) {
        const r = (p.get(t) || 0) + 1;
        p.set(t, r), E && E.register(e, t, e);
    }
    function Y(e) {
        E && E.unregister(e);
    }
    function O(e, t, r = [], o = function() {}) {
        let s = !1;
        const n = new Proxy(o, {
            get (c, u) {
                if (m(s), u === D) return ()=>{
                    Y(n), N(e), t.clear(), s = !0;
                };
                if (u === "then") {
                    if (r.length === 0) return {
                        then: ()=>n
                    };
                    const l = h(e, t, {
                        type: "GET",
                        path: r.map((a)=>a.toString())
                    }).then(g);
                    return l.then.bind(l);
                }
                return O(e, t, [
                    ...r,
                    u
                ]);
            },
            set (c, u, l) {
                m(s);
                const [a, i] = k(l);
                return h(e, t, {
                    type: "SET",
                    path: [
                        ...r,
                        u
                    ].map((f)=>f.toString()),
                    value: a
                }, i).then(g);
            },
            apply (c, u, l) {
                m(s);
                const a = r[r.length - 1];
                if (a === I) return h(e, t, {
                    type: "ENDPOINT"
                }).then(g);
                if (a === "bind") return O(e, t, r.slice(0, -1));
                const [i, f] = M(l);
                return h(e, t, {
                    type: "APPLY",
                    path: r.map((d)=>d.toString()),
                    argumentList: i
                }, f).then(g);
            },
            construct (c, u) {
                m(s);
                const [l, a] = M(u);
                return h(e, t, {
                    type: "CONSTRUCT",
                    path: r.map((i)=>i.toString()),
                    argumentList: l
                }, a).then(g);
            }
        });
        return q(n, e), n;
    }
    function X(e) {
        return Array.prototype.concat.apply([], e);
    }
    function M(e) {
        const t = e.map(k);
        return [
            t.map((r)=>r[0]),
            X(t.map((r)=>r[1]))
        ];
    }
    const L = new WeakMap;
    function v(e, t) {
        return L.set(e, t), e;
    }
    function S(e) {
        return Object.assign(e, {
            [A]: !0
        });
    }
    function k(e) {
        for (const [t, r] of R)if (r.canHandle(e)) {
            const [o, s] = r.serialize(e);
            return [
                {
                    type: "HANDLER",
                    name: t,
                    value: o
                },
                s
            ];
        }
        return [
            {
                type: "RAW",
                value: e
            },
            L.get(e) || []
        ];
    }
    function g(e) {
        switch(e.type){
            case "HANDLER":
                return R.get(e.name).deserialize(e.value);
            case "RAW":
                return e.value;
        }
    }
    function h(e, t, r, o) {
        return new Promise((s)=>{
            const n = $();
            t.set(n, s), e.start && e.start(), e.postMessage(Object.assign({
                id: n
            }, r), o);
        });
    }
    function $() {
        return new Array(4).fill(0).map(()=>Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-");
    }
    var B = {
        dimensions: 2,
        chunk_size: 256,
        min_movement: .4,
        distance_threshold_mode: 0,
        ka: 0,
        kg: 0,
        kr: 0,
        speed: 0,
        prevent_overlapping: !1,
        kr_prime: 0,
        node_radius: 0,
        strong_gravity: !1,
        lin_log: !1,
        dissuade_hubs: !1,
        edge_strength: 0,
        link_distance: 0,
        node_strength: 0,
        coulomb_dis_scale: 0,
        factor: 0,
        interval: 0,
        damping: 0,
        center: [
            0,
            0
        ],
        max_speed: 0,
        max_distance: 100
    }, x = function(e, t) {
        return function(r) {
            var o = b(b({
                name: e
            }, B), r);
            if (e === 2) {
                var s = o.width * o.height, n = Math.sqrt(s) / 10, c = s / (o.nodes.length + 1), u = Math.sqrt(c);
                o.ka = u, o.interval = .99, o.damping = n;
            }
            var l = t(o);
            return {
                nodes: v(l, [
                    l
                ])
            };
        };
    }, J = function(e) {
        return function(t) {
            var r = e(t), o = r.nodes, s = r.edges;
            return {
                nodes: v(o, [
                    o
                ]),
                edges: v(s, [
                    s
                ])
            };
        };
    };
    function P(e) {
        var t = e.force, r = e.dagre;
        return {
            forceatlas2: x(0, t),
            force2: x(1, t),
            fruchterman: x(2, t),
            dagre: J(r)
        };
    }
    function K(e) {
        return j(this, void 0, void 0, function() {
            var t, r;
            return H(this, function(o) {
                switch(o.label){
                    case 0:
                        return e ? [
                            4,
                            import("./antv_layout_wasm-DF1ORQnb.js")
                        ] : [
                            3,
                            4
                        ];
                    case 1:
                        return t = o.sent(), [
                            4,
                            t.default()
                        ];
                    case 2:
                        return o.sent(), [
                            4,
                            t.initThreadPool(navigator.hardwareConcurrency)
                        ];
                    case 3:
                        return o.sent(), [
                            2,
                            S(P(t))
                        ];
                    case 4:
                        return [
                            4,
                            import("./antv_layout_wasm-DAb17obj.js")
                        ];
                    case 5:
                        return r = o.sent(), [
                            4,
                            r.default()
                        ];
                    case 6:
                        return o.sent(), [
                            2,
                            S(P(r))
                        ];
                }
            });
        });
    }
    T(K);
})();
