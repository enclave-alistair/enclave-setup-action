import * as core from '@actions/core';
import {exec} from '@actions/exec';
import {HttpClient} from '@actions/http-client';
import {readFileSync} from 'fs';
import path from 'path';
import {FabricStatus} from './status-types';

export interface IEnclavePid {
  api_key: string;
  heartbeat: number;
  pid: number;
  uri: string;
}

export async function spawnEnclave(
  enclaveBinary: string,
  enrolmentKey: string
): Promise<number> {
  const envCopy: {[id: string]: string} = {};
  let envName: string;
  for (envName in process.env) {
    const envVal = process.env[envName];

    if (envVal) {
      envCopy[envName] = envVal;
    }
  }

  envCopy['ENCLAVE_ENROLMENT_KEY'] = enrolmentKey;
  envCopy['ENCLAVE_BINARY'] = enclaveBinary;

  // Locate the spawn script.
  const spawnScript = path.join(
    __dirname,
    '..',
    '..',
    'external',
    'spawn-linux.sh'
  );

  return await exec(spawnScript, [], {env: envCopy});
}

export async function getEnclaveInfo(
  pidInfo: IEnclavePid
): Promise<{id: string; localAddress: string}> {
  let attemptCounter = 0;
  while (attemptCounter < 5) {
    try {
      const headers = {
        ['X-Auth-Token']: pidInfo.api_key,
        ['Content-Type']: 'application/json'
      };

      // Now call the API to get the status.
      const http: HttpClient = new HttpClient('enclave-actions');

      const requestUri = `${pidInfo.uri}fabric/status`;

      core.debug(`Querying ${requestUri}`);

      const apiResponse = await http.getJson<FabricStatus>(requestUri, headers);

      core.debug(JSON.stringify(apiResponse));

      const status = apiResponse.result;

      // Only when ready...
      if (status && status.Profile.VirtualAddress) {
        return {
          id: status.Profile.Certificate.subjectDistinguishedName,
          localAddress: status.Profile.VirtualAddress
        };
      }

      throw new Error('Not ready');
    } catch (err) {
      core.info(`Could not load enclave status yet... ${err})`);

      attemptCounter++;

      if (attemptCounter < 5) {
        await sleep(3000);
      }
    }
  }

  throw new Error('Could not load enclave status');
}

export async function getEnclavePidInfo(): Promise<IEnclavePid> {
  let attemptCounter = 0;
  while (attemptCounter < 5) {
    try {
      const pidContents = readFileSync(
        '/etc/enclave/pid/Universe.profile.pid',
        'utf-8'
      );

      const pidObject: IEnclavePid = JSON.parse(pidContents);

      return pidObject;
    } catch (err) {
      core.info(`Could not read enclave PID yet... (${err})`);

      attemptCounter++;

      if (attemptCounter < 5) {
        await sleep(3000);
      }
    }
  }

  throw new Error('Could not load PID file');
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
