const k8s = require('@kubernetes/client-node');

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

kc.setCurrentContext(kc.getCurrentContext()); // Force context reload

// ⚠️ Force skip TLS in client
kc.getCurrentCluster().skipTLSVerify = true;

const watch = new k8s.Watch(kc);

const events = [];

watch.watch(
  '/api/v1/pods',
  {},
  (type, obj) => {
    const event = {
    //  timestamp: new Date().toISOString(),
     
     
     timestamp: new Date().toLocaleString(), // default local format
     type,
      pod_name: obj.metadata?.name || '',
      namespace: obj.metadata?.namespace || '',
      reason: obj.status?.reason || '',
      message: obj.status?.message || '',
      node_name: obj.spec?.nodeName || '',
      host_ip: obj.status?.hostIP || '',
      pod_ip: obj.status?.podIP || '',
      phase: obj.status?.phase || ''




      // timestamp: obj.eventTime || obj.lastTimestamp || new Date().toISOString(),
      // type,
      // involvedObject: obj.involvedObject?.name || '',
      // namespace: obj.metadata?.namespace || '',
      // reason: obj.reason || '',
      // message: obj.message || '',
      // source: obj.source?.component || '',
      // typeOfEvent: obj.type || ''












    };

    events.push(event);
    if (events.length > 1000) events.shift();
   // console.log(`📦 ${type} - ${event.pod_name} (${event.namespace})`);
  },
  err => {
    if (err) console.error('Watch error:', err);
  }
);

module.exports = {
  getEvents: () => events
};
