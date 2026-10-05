/**
 * Load order matters: `./crypto` must fully evaluate before anything that
 * touches @noble/hashes, which WalletConnect does at import time. ES imports
 * are hoisted but evaluate top to bottom, so this order is the guarantee.
 */
import './crypto';

import './walletconnect';

import './desktop';

import './verify';
