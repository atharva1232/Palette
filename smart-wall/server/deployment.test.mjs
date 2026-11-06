import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentSettings } from './deployment.mjs';
test('Render supplies the actual HTTPS origin; explicit custom origin wins', () => {
 assert.equal(deploymentSettings({RENDER_EXTERNAL_URL:'https://smartwall-example.onrender.com'},true).origin,'https://smartwall-example.onrender.com');
 assert.equal(deploymentSettings({APP_ORIGIN:'https://custom.example/',RENDER_EXTERNAL_URL:'https://ignored.example'},true).origin,'https://custom.example');
 assert.equal(deploymentSettings({},false).origin,'http://127.0.0.1:4200');
 for(const value of ['http://unsafe.example','https://example.com/path','https://user:pass@example.com','https://example.com?x=1']) assert.throws(()=>deploymentSettings({APP_ORIGIN:value},true));
});
test('Proxy trust is explicit and bounded, never blindly trusts every header', () => {
 assert.equal(deploymentSettings({}).proxyHops,0);assert.equal(deploymentSettings({TRUST_PROXY_HOPS:'1'}).proxyHops,1);
 for(const value of ['true','-1','6','1.5']) assert.throws(()=>deploymentSettings({TRUST_PROXY_HOPS:value}));
});
