(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxSubnet = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  // Расчёт IPv4-подсети для тренажёра. Вынесен из app.js, чтобы его можно было
  // проверить тестами (аудит A5): прежняя версия для /31 давала первый хост
  // больше последнего, а для /32 — «первый» и «последний» вне сети.

  function toNumber(ip) {
    const parts = String(ip).trim().split('.');
    if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
    return parts.reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
  }

  function toIp(value) {
    return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
  }

  function maskFor(prefix) {
    return prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  }

  function calcSubnet(ip, prefix) {
    const address = toNumber(ip);
    const bits = Number(prefix);
    if (address === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
    const mask = maskFor(bits);
    const network = (address & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    let first;
    let last;
    let hosts;
    if (bits === 32) {
      // Один адрес: маршрут на хост, loopback или адрес за NAT.
      first = network; last = network; hosts = 1;
    } else if (bits === 31) {
      // RFC 3021: в point-to-point /31 оба адреса — хосты, broadcast нет.
      first = network; last = broadcast; hosts = 2;
    } else {
      first = (network + 1) >>> 0; last = (broadcast - 1) >>> 0; hosts = Math.pow(2, 32 - bits) - 2;
    }
    return {
      network: toIp(network), broadcast: toIp(broadcast), first: toIp(first), last: toIp(last),
      hosts, mask: toIp(mask), pointToPoint: bits === 31
    };
  }

  const PRIVATE_BLOCKS = [
    { base: '10.0.0.0', prefix: 8 },
    { base: '172.16.0.0', prefix: 12 },
    { base: '192.168.0.0', prefix: 16 }
  ];
  const PREFIXES = [16, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

  // Задача с адресом хоста, а не сети: так поле «Адрес сети» нужно вычислить,
  // а не переписать из условия (аудит C8.3). random — функция [0, 1) для тестов.
  function generateProblem(random) {
    const next = typeof random === 'function' ? random : Math.random;
    const pick = list => list[Math.min(list.length - 1, Math.floor(next() * list.length))];
    for (let attempt = 0; attempt < 20; attempt++) {
      const block = pick(PRIVATE_BLOCKS);
      const prefix = pick(PREFIXES.filter(value => value > block.prefix));
      const span = Math.pow(2, 32 - block.prefix);
      const address = (toNumber(block.base) + Math.floor(next() * span)) >>> 0;
      const ip = toIp(address);
      const answer = calcSubnet(ip, prefix);
      if (ip !== answer.network && ip !== answer.broadcast) {
        return { ip, prefix, desc: 'Случайный адрес хоста в /' + prefix, generated: true };
      }
    }
    return { ip: '192.168.10.77', prefix: 26, desc: 'Адрес хоста в /26', generated: true };
  }

  return { toNumber, toIp, calcSubnet, generateProblem };
});
