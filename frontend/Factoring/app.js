(function() {
var images = {
    linux: ["http://52.31.143.91/images/gu-factor-linux.tar.gz", "gu-factor-linux"],
    macos: ["http://52.31.143.91/images/gu-factor-macos.tar.gz", "gu-factor-macos"],
}

angular.module('gu')
.run(function(pluginManager) {
    pluginManager.addTab({name: 'Factoring', icon: '/plug/Factoring/factoring.svg', page: '/plug/Factoring/base.html'})
})

.controller('FactoringController', function($scope) {

    var myStorage = window.localStorage;

    $scope.config = {
        number: myStorage.getItem('factoring:number', '')
    };

    $scope.sessionPage=function(session) {
        var session = $scope.session;

        if (!session) {
            return;
        }

        if (session.status === 'NEW') {
            return "/plug/Factoring/new-session.html";
        }
        if (session.status === 'WORKING') {
            return "/plug/Factoring/session-working.html"
        }

    }

    $scope.save = function() {
        console.log('save ', $scope.config);
        myStorage.setItem('factoring:number',$scope.config.number);
    }

    $scope.openSession = function(session) {
        console.log('open', session, $scope.active);
        $scope.session = session;
        $scope.active = 1;
    }

    $scope.onSessions = function() {
        console.log('on sessions');
        delete $scope.session;
    }
})

.controller('FactoringSessionsController', function($scope, $uibModal, $log, sessionMan, factoringMan) {

    $scope.sessions = sessionMan.sessions('gu:factoring');
    $scope.newSession = function() {
        sessionMan.create('gu:factoring', 'hd');
        $scope.sessions = sessionMan.sessions('gu:factoring');
    };

    function reload() {
        $scope.sessions = sessionMan.sessions('gu:factoring');
    }

    $scope.dropSession = function(session) {
        $uibModal.open({
            animate: true,
            templateUrl: 'modal-confirm.html',
            controller: function($scope, $uibModalInstance) {
                $scope.title = 'Session delete';
                $scope.question = 'Delete session ' + session.id + ' ?';
                $scope.ok = function() {
                    var mSession = factoringMan.session(session.id);
                    sessionMan.dropSession(session);
                    reload();
                    $uibModalInstance.close()
                }
            }
        })
    }
})

.controller('FactoringPreselection', function($scope, sessionMan) {

    $scope.peers = [];
    $scope.all = false;
    sessionMan.peers($scope.session, true).then(peers => $scope.peers = peers);

    $scope.$watch('all', function(v) {
        if ($scope.all) {
            _.each($scope.peers, peer => peer.assigned=true)
        } else {
            _.each($scope.peers, peer => peer.assigned=false)
        }
    });

    $scope.blockNext = function(peers) {
        return !peers.some(peer => !!peer.assigned);
    }

    $scope.start = function() {
        sessionMan.updateSession($scope.session, 'WORKING', {peers: _.filter($scope.peers, peer => peer.assigned)})
    }

    console.log('FactoringPreselection session', $scope.session);
})

.controller('FactoringWork', function($scope, $log, sessionMan, factoringMan) {

    var session = $scope.$eval('session');
    $scope.fSession = factoringMan.session(session.id);
    $scope.number = '';

    sessionMan.peers(session, true).then(peers => {
        $scope.peers = peers;
        $scope.fSession.resolveSessions();
    });

    $scope.factorize = function() {
        $scope.fSession.start($scope.number);
    }

    $scope.stop = function() {
        $log.info("stopping");
        $scope.fSession.stop($scope.number);
    }


    console.log('FactoringWork session', $scope.session);
})

.service('factoringMan', function($log, $interval, $q, sessionMan, hdMan) {

    const TAG_FACTORING = 'gu:factoring';

    function isFactoringSession(session) {
        return _.any(session.data.tags, tag => tag === TAG_FACTORING);
    }

    class FactoringSession {
        constructor(id) {
            this.id = id;
            this.session = sessionMan.getSession(id);
            this.peers = [];
            this.$resolved=false;
            this.result=[];
        }

        resolveSessions() {
            if (!this.$resolved) {
                sessionMan.peers(this.session, true).then(peers => {
                        $log.info('resolved peers', this.session, peers);
                        this.peers = _.map(peers, peer => {
                            return new FactoringPeer(this, peer.nodeId, peer)
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
            var i=0;
            this.work = [];
            while (from < number) {
                this.work[i++] = [number, from, from += step];
            }
            this.work.reverse();
            this.workSize = i;
            this.workDone = 0;
            this.result=[];

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
                        workDesc[1] = Math.ceil(workDesc[1]/ divisor);
                        workDesc[1] = Math.ceil(workDesc[2]/ divisor);
                    })
                }
            });
            this.result = this.result.concat(result);
        }

        isWorking() {
            return this.workDone < this.workSize;
        }
    }

    class FactoringPeer {
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
                if (isFactoringSession(rawSession)) {
                    this.fpSession = new FactoringPeerSession(this, rawSession.id, TAG_FACTORING);
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
                    name: TAG_FACTORING,
                    image: {cache_file: image[1] + '.tar.gz', url: image[0]},
                    tags: [TAG_FACTORING]
                });
                this.fpSession = new FactoringPeerSession(this, rawSession.id);
                this.fpSession.hdSession = rawSession;

                return rawSession.$create.then(v => {
                    return session;
                })
            });

            return promise;
        }

        save(key, val) {
            window.localStorage.setItem(TAG_FACTORING + ':' + this.id + ':' + key, JSON.stringify(val))
        }

        load(key) {
            var key = TAG_FACTORING + ':' + this.id + ':' + key;
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
                    var arr = JSON.parse(r.substring(r.lastIndexOf(':')+1, r.length-1));
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

    class FactoringPeerSession {

        constructor(peer, id) {
            this.peer = peer;
            this.id= id;
        }

        exec(number, from, to) {
            $log.info('factoring exec:', number, from, to);
            return this.hdSession.exec('gu-factor', [''+number, ''+from, ''+to]);
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
        cache[id] = new FactoringSession(id);
        return cache[id];
    }

    return { session: session }
})
})();