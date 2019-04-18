(function () {
    const images = {
        "Linux": {url: "http://52.31.143.91/images/gu-factor-linux.tar.gz", hash: "sha1:99d841969474042495aa5438088e5ee0b1146e7c"},
        "MacOs": {url: "http://52.31.143.91/images/gu-factor-macos.tar.gz", hash: "sha1:95f24ce9b761bef7214b21617bd3b6a924895f67"},
    };

    const tags = ['gu:demo', 'gu:demo:taskType=factorization'];

    class ProcessingManager {
        constructor(deployments) {
            this.deployments = deployments;
            this.working = false;
            this.counters = {};
        }

        run(value) {

            let self = this;
            let working = {
                val: BigInt(value),
                position: BigInt(2),
                fact: []
            };

            async function processWork(deployment) {
                let work = self.produceWork();
                while (work && self.working === working) {
                    let result = await deployment.update(work.commands);
                    self.counters[deployment.node.id]= (self.counters[deployment.node.id] || 0)+1;
                    if (self.working == working) {
                        self.addResult(work, result);
                    }

                    work = self.produceWork();
                }
            }

            this.working = working;

            return Promise.all(this.deployments.map(processWork))
        }

        workCnt(nodeId) {
            return this.counters[nodeId];
        }

        get progress() {
            return this.working ? Number(this.working.position * 100n / this.working.val) : 100;
        }

        get isActive() {
            return this.working && this.working.position < this.working.val;
        }

        stop() {
            this.results = this.working;
            this.working = undefined;
        }

        produceWork() {
            let val = this.working.val;
            let from = this.working.position;
            let to = from+BigInt(100000);

            if (from >= val) {
                return;
            }

            if (to > val) {
                to = val;
            }

            this.working.position = to;

            return {
                from: from,
                to: to,
                val: val,
                commands: [{exec: {executable: "gu-factor", args: [val.toString(), from.toString(), to.toString()]}}]
            }
        }

        addResult(work, result) {
            let r = result[0];
            var arr = JSON.parse(r.substring(r.lastIndexOf(':') + 1, r.length - 1));
            this.working.fact = this.working.fact.concat(arr);
        }

    }

    angular.module('gu')
        .run(function (pluginManager, sessionMan) {

            pluginManager.addActivator({
                id: 'cdd7b982-6028-11e9-84b6-ab4470ed0d81',
                name: 'Factorization',
                iconClass: 'gu-factorization-icon',
                sessionTag: tags,
                controller: controller
            });

            function controller(action, context, session) {
                switch (action) {
                    case 'new-session':
                        newSession(context);
                        break;
                    case 'browse':
                        context.setPage(session, '/plug/Factorization/base.html');
                        break;
                }
            }

            function newSession(context) {
                sessionMan.create('Factorization demo', tags)
                    .then(session => session.setConfig({
                        status: "new"
                    }).then(data => {
                        return session;
                    }))
                    .then(session => {
                        context.setPage(session, '/plug/Factorization/base.html');
                    });

            }

        })

        .service('factorizationMan', function ($log, $interval, $q, sessionMan, hdMan) {

            async function deployApp(session, sessionPeers = []) {
                if (sessionPeers.length > 0) {
                    await session.addPeers(sessionPeers);
                }

                let peers = await session.peers;

                let pendingDeployments = [];

                for (let peer of peers) {
                    let deployments = await peer.deployments;

                    if (deployments.length === 0) {
                        peer.createHdDeployment({
                            name: "Factorization demo backend",
                            tags: tags,
                            images: images
                        });
                    }
                    else {
                        pendingDeployments.push(deployments[0]);
                    }
                }

                let deployments = await Promise.all(pendingDeployments);

                /*await*/ session.updateConfig(config => {
                    if (config.status === 'new') {
                        config.status = 'working';
                    }
                });

                return deployments;
            }


            return {deployApp: deployApp}
        })


        .controller('FactorizationPreselection', function ($scope, factorizationMan) {
            let session = $scope.$eval('currentSession');
            let context = $scope.$eval('sessionContext');

            session.getConfig().then(config => {
                if (config.status === "working") {
                    context.setPage(session, '/plug/Factorization/session-working.html');
                }
            });

            session.peers.then(peers => {
                $scope.sessionPeers = peers.map(peer => peer.id);
            });


            //
            $scope.goNext = function () {
                factorizationMan.deployApp(session, $scope.sessionPeers).then(() => {
                    context.setPage(session, '/plug/Factorization/session-working.html');
                })
            };
        })
        .controller('FactorizationWork', function ($scope, factorizationMan) {
            let session = $scope.$eval('currentSession');
            let context = $scope.$eval('sessionContext');

            $scope.peers = [];
            $scope.value = 0n;


            factorizationMan.deployApp(session).then(deployments => {
                console.log('app ready');
                $scope.deployments = deployments;
                $scope.peers = deployments.map(deployment => deployment.node);
                $scope.manager = new ProcessingManager(deployments);
            });

            $scope.factorize = function () {
                let value = BigInt($scope.value);
                if (value) {
                    $scope.manager.run(value);
                }
            }

        })
        .controller('FactorizationController', function ($scope) {

            var myStorage = window.localStorage;

            $scope.config = {
                number: myStorage.getItem('factorization:number', '')
            };

            $scope.sessionPage = function (session) {
                var session = $scope.session;

                if (!session) {
                    return;
                }

                if (session.status === 'NEW') {
                    return "/plug/Factorization/new-session.html";
                }
                if (session.status === 'WORKING') {
                    return "/plug/Factorization/session-working.html"
                }

            };

            $scope.save = function () {
                console.log('save ', $scope.config);
                myStorage.setItem('factorization:number', $scope.config.number);
            };

            $scope.openSession = function (session) {
                console.log('open', session, $scope.active);
                $scope.session = session;
                $scope.active = 1;
            };

            $scope.onSessions = function () {
                console.log('on sessions');
                delete $scope.session;
            }
        })

        /*
        .controller('FactorizationWork', function ($scope, $log, sessionMan, factorizationMan) {

            var session = $scope.$eval('session');
            $scope.fSession = factorizationMan.session(session.id);
            $scope.number = '';

            sessionMan.peers(session, true).then(peers => {
                $scope.peers = peers;
                $scope.fSession.resolveSessions();
            });

            $scope.factorize = function () {
                $scope.fSession.start($scope.number);
            };

            $scope.stop = function () {
                $log.info("stopping");
                $scope.fSession.stop($scope.number);
            };


            console.log('FactorizationWork session', $scope.session);
        })
        */

        /*.service('factorizationMan', function ($log, $interval, $q, sessionMan, hdMan) {

            const TAG_FACTORIZATION = 'gu:factorization';

            function isFactorizationSession(session) {
                return _.any(session.data.tags, tag => tag === TAG_FACTORIZATION);
            }

            class FactorizationSession {
                constructor(id) {
                    this.id = id;
                    this.session = sessionMan.getSession(id);
                    this.peers = [];
                    this.$resolved = false;
                    this.result = [];
                }

                resolveSessions() {
                    if (!this.$resolved) {
                        sessionMan.peers(this.session, true).then(peers => {
                            $log.info('resolved peers', this.session, peers);
                            this.peers = _.map(peers, peer => {
                                return new FactorizationPeer(this, peer.nodeId, peer)
                            });
                            this.$resolved = true;

                            this.initPeers();

                            return peers;
                        });
                    }
                }

                initPeers() {
                    _.each(this.peers, peer => peer.init())
                }

                peer(nodeId) {
                    return _.findWhere(this.peers, {id: nodeId});
                }

                commit() {
                    _.each(this.peers, peer => peer.commit());
                }

                start(number) {
                    var number = parseInt(number);
                    if (!number) {
                        $log.error("not a number: ", number);
                        return
                    }
                    this.number = number;

                    $log.info("factorizing: " + number);
                    var step = 10e7;

                    if (number / step > 10e7) {
                        $log.error("cowardly refusing to tackle with such a big number", number);
                        return
                    }

                    var from = 1;
                    var i = 0;
                    this.work = [];
                    while (from < number) {
                        this.work[i++] = [number, from, from += step];
                    }
                    this.work.reverse();
                    this.workSize = i;
                    this.workDone = 0;
                    this.result = [];

                    $log.info(this.work);
                    _.each(this.peers, peer => peer.factorize());
                }

                stop() {
                    this.work = [];
                }

                getWork() {
                    return this.work.pop();
                }

                giveUpWork(workDesc) {
                    $log.warn("partial work given up", workDesc);
                    this.work.push(workDesc);
                }

                resolveWork(result) {
//            $log.info("partial work result", result);
                    this.workDone++;
                    _.each(result, divisor => {
                        while (this.number % divisor == 0 && divisor > 1) {
                            this.number /= divisor;
                            _.each(this.work, workDesc => {
                                workDesc[0] = this.number;
                                workDesc[1] = Math.ceil(workDesc[1] / divisor);
                                workDesc[1] = Math.ceil(workDesc[2] / divisor);
                            })
                        }
                    });
                    this.result = this.result.concat(result);
                }

                isWorking() {
                    return this.workDone < this.workSize;
                }
            }

            class FactorizationPeer {
                constructor(session, nodeId, details) {
                    this.session = session;
                    this.id = nodeId;
                    this.peer = hdMan.peer(nodeId);
                    this.os = details.os;
                    this.gpu = details.gpu;
                    this.$afterBench = null;

                    if (details.sessions) {
                        $this.$init = this.importSessions(details.sessions);
                    } else {
                        $log.warn('no import', details, session);
                        this.$init = this.peer.sessions().then(sessions => this.importSessions(sessions));
                    }
                }

                importSessions(rawHdManSessions) {
                    $log.info('rawSessions', rawHdManSessions);
                    _.each(rawHdManSessions, rawSession => {
                        if (isFactorizationSession(rawSession)) {
                            this.fpSession = new FactorizationPeerSession(this, rawSession.id, TAG_FACTORIZATION);
                            this.fpSession.hdSession = rawSession;
                        }
                    });
                }

                init() {
                    $q.when(this.$init).then(_v => {
                        if (!this.fpSession) {
                            this.deploy()
                        }
                    });
                }

                deploy() {
                    var promise = sessionMan.getOs(this.id).then(os => {
                        var image = images[os.toLowerCase()];
                        $log.info('image', image, os.toLowerCase(), images[os.toLowerCase()]);
                        $log.info('hd peer', typeof this.peer, this.peer);
                        var rawSession = this.peer.newSession({
                            name: TAG_FACTORIZATION,
                            image: {cache_file: image[1] + '.tar.gz', url: image[0]},
                            tags: [TAG_FACTORIZATION]
                        });
                        this.fpSession = new FactorizationPeerSession(this, rawSession.id);
                        this.fpSession.hdSession = rawSession;

                        return rawSession.$create.then(v => {
                            return session;
                        })
                    });

                    return promise;
                }

                save(key, val) {
                    window.localStorage.setItem(TAG_FACTORIZATION + ':' + this.id + ':' + key, JSON.stringify(val))
                }

                load(key) {
                    var key = TAG_FACTORIZATION + ':' + this.id + ':' + key;
                    var it = window.localStorage.getItem(key);
                    if (it) {
                        return JSON.parse(it);
                    }
                }

                commit() {
//            this.save('hr', hr);
                }

                factorize() {
                    var workDesc = this.session.getWork();
                    if (!workDesc)
                        return;

                    var [number, from, to] = workDesc;
                    this.fpSession.exec(number, from, to).then(output => {
                        if (output.Ok) {
                            var r = output.Ok[0];
                            var arr = JSON.parse(r.substring(r.lastIndexOf(':') + 1, r.length - 1));
                            this.session.resolveWork(arr);
                            this.factorize();
                        } else {
                            $log.error('exec err', output, this);
                            this.session.giveUpWork(workDesc);
                        }
                    })
                }

                removeSession(session) {
                    this.sessions = _.without(this.sessions, session);
                }
            }

            class FactorizationPeerSession {

                constructor(peer, id) {
                    this.peer = peer;
                    this.id = id;
                }

                exec(number, from, to) {
                    $log.info('factorization exec:', number, from, to);
                    return this.hdSession.exec('gu-factor', ['' + number, '' + from, '' + to]);
                }

                drop() {
                    this.hdSession.destroy().then(_v =>
                        this.peer.removeSession(this)
                    )
                }
            }

            var cache = {};

            function session(id) {
                if (id in cache) {
                    return cache[id];
                }
                cache[id] = new FactorizationSession(id);
                return cache[id];
            }

            return {session: session}
        })*/
})();