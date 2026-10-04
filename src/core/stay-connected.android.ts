import { AppRegistry } from 'react-native';

import StayConnected from '../../modules/stay-connected';

AppRegistry.registerHeadlessTask('StayConnected', () => () => new Promise<void>(() => {}));

export function staysConnected(): boolean {
  return StayConnected.isEnabled();
}

export function setStayConnected(on: boolean): void {
  StayConnected.setEnabled(on);
}

export function resumeStayingConnected(): void {
  StayConnected.resume();
}
