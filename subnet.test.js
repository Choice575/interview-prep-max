const test = require('node:test');
const assert = require('node:assert/strict');
const Subnet = require('./public/subnet.js');

test('calculates an ordinary subnet from a host address', () => {
  assert.deepEqual(Subnet.calcSubnet('192.168.1.130', 26), {
    network: '192.168.1.128', broadcast: '192.168.1.191', first: '192.168.1.129', last: '192.168.1.190',
    hosts: 62, mask: '255.255.255.192', pointToPoint: false
  });
  assert.equal(Subnet.calcSubnet('10.20.30.40', 8).network, '10.0.0.0');
  assert.equal(Subnet.calcSubnet('0.0.0.0', 0).broadcast, '255.255.255.255');
});

test('treats /31 as a two-host point-to-point link and /32 as a single address', () => {
  const p2p = Subnet.calcSubnet('10.0.0.1', 31);
  assert.equal(p2p.first, '10.0.0.0');
  assert.equal(p2p.last, '10.0.0.1');
  assert.equal(p2p.hosts, 2);
  assert.equal(p2p.pointToPoint, true);
  assert.ok(Subnet.toNumber(p2p.first) <= Subnet.toNumber(p2p.last), 'первый хост не больше последнего');
  const single = Subnet.calcSubnet('192.0.2.7', 32);
  assert.equal(single.first, '192.0.2.7');
  assert.equal(single.last, '192.0.2.7');
  assert.equal(single.hosts, 1);
});

test('rejects malformed input instead of producing a bogus network', () => {
  assert.equal(Subnet.calcSubnet('300.1.1.1', 24), null);
  assert.equal(Subnet.calcSubnet('10.0.0', 24), null);
  assert.equal(Subnet.calcSubnet('10.0.0.1', 33), null);
});

test('generated problems use host addresses inside private ranges', () => {
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let index = 0; index < 200; index++) {
    const problem = Subnet.generateProblem(random);
    const answer = Subnet.calcSubnet(problem.ip, problem.prefix);
    assert.notEqual(problem.ip, answer.network);
    assert.notEqual(problem.ip, answer.broadcast);
    assert.ok(problem.prefix >= 16 && problem.prefix <= 30);
    assert.match(problem.ip, /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/);
  }
});

test('static subnet tasks give a host address, not the network itself', () => {
  const tasks = require('./public/tasks/subnet.json');
  for (const task of tasks) {
    const answer = Subnet.calcSubnet(task.ip, task.prefix);
    assert.ok(answer, task.ip);
    assert.notEqual(task.ip, answer.network, `${task.ip}/${task.prefix}`);
  }
});
