// Native Messaging host entry. Chrome launches this through the launcher
// script that `employ-me setup` writes. stdout carries protocol frames ONLY:
// a stray console.log here corrupts the channel (ESLint blocks console in the
// helper).
import { runHost } from './host/run';

await runHost(process.stdin, process.stdout);
