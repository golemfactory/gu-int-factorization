(function () {
    const images = {
        "Linux": {url: "http://52.31.143.91/images/gu-factor-linux.tar.gz", hash: "sha1:99d841969474042495aa5438088e5ee0b1146e7c"},
        "MacOs": {url: "http://52.31.143.91/images/gu-factor-macos.tar.gz", hash: "sha1:95f24ce9b761bef7214b21617bd3b6a924895f67"},
    };

    const tags = ['gu:demo', 'gu:demo:taskType=factorization'];

    class FactorizationProcess {

        constructor(val) {
            this.val = BigInt(val);
            this.workVal = this.val;
            this.position = 2n;
            this.fact = [];
        }

        get progress() {
            return Number(this.position * 100n / this.workVal);
        }

        get isActive() {
            return this.position < this.val;
        }

        createWork() {
            let val = this.workVal;
            let from = this.position;
            let to = from+BigInt(200000);

            if (from >= val) {
                return;
            }

            if (to > val) {
                to = val;
            }

            this.position = to;

            return {
                from: from,
                to: to,
                val: val,
                commands: [{exec: {executable: "gu-factor", args: [val.toString(), from.toString(), to.toString()]}}]
            }
        }

        addResult(work, result) {
            let r = result[0];
            var arr = JSON.parse(r.substring(r.lastIndexOf(':') + 1, r.length - 1)).map(it => BigInt(it));

            /*
            arr.sort();

            let val = this.workVal;
            let position = this.position;
            for (let it of arr) {
                while ((val % it) === 0n && it > 1n) {
                    val = val / it;
                    this.fact.push(it);
                }
            }
            this.workVal = val;
            this.position = position;
             */

            this.fact = this.fact.concat(arr);
        }

        stop() {

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
                        let v= peer.createHdDeployment({
                            name: "Factorization demo backend",
                            tags: tags,
                            images: images
                        });
                        pendingDeployments.push(v);
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
        .controller('FactorizationWork', function ($scope, factorizationMan, guProcessMan) {
            let session = $scope.$eval('currentSession');
            let context = $scope.$eval('sessionContext');

            $scope.peers = [];
            $scope.value = 0n;


            factorizationMan.deployApp(session).then(deployments => {
                console.log('app ready', deployments);
                $scope.deployments = deployments;
                $scope.peers = deployments.map(deployment => deployment.node);
                $scope.manager = guProcessMan.getProcess(session);
                if ($scope.manager.process) {
                    $scope.value = $scope.manager.process.val;
                }
                else if ($scope.manager.lastResult) {
                    $scope.value = $scope.manager.lastResult.val;
                }
                $scope.$apply();
            });

            $scope.factorize = function () {
                let value = BigInt($scope.value);
                if (value) {
                    let process = new FactorizationProcess(value);
                    $scope.manager.run(process, $scope.deployments);
                }
            };
        })

})();