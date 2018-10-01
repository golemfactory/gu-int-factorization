
var images = {
    linux: ["http://10.30.8.179:61622/app/images/gu-factor-linux.tar.gz", "guf-linux"],
    macos: ["http://10.30.8.179:61622/app/images/gu-factor-macos.tar.gz", "guf-macos"],
}

angular.module('gu')
.run(function(pluginManager) {
    pluginManager.addTab({name: 'Factoring', icon: '/plug/Factoring/baby-formula.svg', page: '/plug/Factoring/base.html'})
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
        $scope.fSession.start($scope.number)
    }


    console.log('FactoringWork session', $scope.session);
})

.service('factoringMan', function($log, $interval, $q, sessionMan, hdMan) {

    const TAG_FACTORING = 'gu:factoring';

    var progress = {};

    function startProgress(nodeId, tag, estimated, future, label) {
        var nodeProgress = progress[nodeId] || {};
        var tagProgress = nodeProgress[tag] || {};
        var ts = new Date();

        tagProgress.start = ts.getTime();
        tagProgress.end = ts.getTime() + estimated*1000;
        tagProgress.size = tagProgress.end - tagProgress.start;
        tagProgress.label = label;

        nodeProgress[tag] = tagProgress;
        progress[nodeId] = nodeProgress;

        $q.when(future)
        .then(v => $log.info('tag done', tag, nodeId))
        .then(v => delete nodeProgress[tag])
    }

    function getProgressAll() {
        return progress;
    }

    function getProgress(nodeId, tag) {
        var nodeProgress = progress[nodeId] || {};
        var tagProgress = nodeProgress[tag] || {};

        return tagProgress;
    }

    function isFactoringSession(session) {
        return _.any(session.data.tags, tag => tag === 'gu:factoring');
    }

    function getSessionType(session) {
            if (_.any(session.data.tags, tag => tag === TAG_FACTORING)) {
                return TAG_FACTORING;
            }
    }

    class FactoringSession {
        constructor(id) {
            this.id = id;
            this.session = sessionMan.getSession(id);
            this.peers = [];
            this.$resolved=false;
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
            var step = Math.ceil( number / (peers.length * 10) );
            var from = 1;

            while (from < number) {
                this.work[i] = [number, from, from + step];
                from += step;
            }
        }

        getWork() {
            this.work.pop()
        }

        resolveWork(result) {
            this.result += result;
        }
    }

    class FactoringPeer {
        constructor(session, nodeId, details) {
            this.session = session;
            this.id = nodeId;
            this.peer = hdMan.peer(nodeId);
            this.os = details.os;
            this.gpu = details.gpu;
            this.sessions = [];
            // map session.type -> 'pid'
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
            this.sessions = [];
            _.each(rawHdManSessions, rawSession => {
                if (isFactoringSession(rawSession)) {
                    var session = new FactoringPeerSession(this, rawSession.id, getSessionType(rawSession));
                    session.hdSession = rawSession;
                    this.sessions.push(session);
                }
            });
        }

        // TODO: exec
        init() {
            $q.when(this.$init).then(_v => {
                this.deploy(sessType).then(session => {
                    $log.info("would exec", session)
                })
            });
        }

        deploy(type) {
            var promise = sessionMan.getOs(this.id).then(os => {
                var image = images[os.toLowerCase()];
                $log.info('image', image, os.toLowerCase(), images[os.toLowerCase()], type);
                $log.info('hd peer', typeof this.peer, this.peer);
                var rawSession = this.peer.newSession({
                    name: 'gu:factoring ' + type,
                    image: {cache_file: image[1] + '.tar.gz', url: image[0]},
                    tags: ['gu:factoring', type]
                });
                var session = new FactoringPeerSession(this, rawSession.id, type);
                session.hdSession = rawSession;

                this.sessions.push(session);

                return rawSession.$create.then(v => {
                    return session;
                })
            });

            startProgress(this.id, 'deploy:' + type, 15, promise, 'installing');

            return promise;
        }

        save(key, val) {
            window.localStorage.setItem('gu:factoring:' + this.id + ':' + key, JSON.stringify(val))
        }

        load(key) {
            var key = 'gu:factoring:' + this.id + ':' + key;
            var it = window.localStorage.getItem(key);
            if (it) {
                return JSON.parse(it);
            }
        }

        commit() {
//            this.save('hr', hr);
        }

        exec(type, mode) {
            var session = _.findWhere(this.sessions, {type: type});
            $log.info('exec', type, mode, session);
            return session.exec(mode).then(r => {
                if (r.Ok) {
                    var pid = r.Ok;
                }
            })
        }

        removeSession(session) {
            this.sessions = _.without(this.sessions, session);
        }
    }

    class FactoringPeerSession {

        constructor(peer, id, number, from, to) {
            this.peer = peer;
            this.id= id;
            this.number = number;
            this.from = from;
            this.to = to;
        }

        exec() {
            $log.info('factoring exec', number, from, to);
            return this.hdSession.exec('gu-mine', [''+this.number, ''+this.from, ''+this.to]).then(output => {
                if (output.Ok) {
                    try {
                        this.status = 'RUNNING';
                        var result = output.Ok;
                        $log.info('exec output:', result);
                        return output.Ok;
                    } catch(e) {
                        this.status = 'FAIL';
                        $log.error('hr fail', e, output, this);
                        return {Err: 'invalid output'};
                    }
                } else {
                    this.status = 'FAIL';
                    return output;
                }
            })
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

    interval = $interval(tick, 500);

    function tick() {
        var ts = new Date();

        _.each(progress, (progressNode, nodeId) => {
            _.each(progressNode, (progressInfo, tag) => {
                if (!progressInfo.size) {
                    progressInfo.size = progressInfo.end - progressInfo.start;
                }
                progressInfo.pos = ts.getTime() - progressInfo.start;
                if (progressInfo.pos > progressInfo.size) {
                    progressInfo.size = progressInfo.size * 1.2;
                }
            })
        })
    }

    return { session: session, progress: getProgress, getProgressAll: getProgressAll }
})