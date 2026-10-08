/**
 * Where the CallBridge server is. One server for every user: set EXPO_PUBLIC_SERVER_URL to point a
 * build at another one (a staging server, or the laptop over its tunnel).
 */
export const SERVER_URL = (process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://callbridge.byte2bite.tech').trim().replace(/\/+$/, '');
