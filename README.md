# webstorage-mutex 🔒

Fast mutual exclusion for safe cross tab Web Storage access

## Installation

```sh
npm install webstorage-mutex
# yarn add webstorage-mutex
```

## Example

```javascript
const value = await mutex(
  () => {
    let v = window.localStorage.getItem('test-item');
    if (!v) {
      v = '*';
    } else {
      v = v + '*';
    }
    window.localStorage.setItem('test-item', v);
    return v;
  },
  {
    lockPrefix: 'webstorage-mutex',
    repeatInterval: 50,
    repeatTimeout: 15_000,
    delayTime: 50,
  }
).catch((reason) => {
  if (reason.message === 'mutex timeout') {
    // handle scenario where critical section executes too long
  }
});
console.log(value);
```

## Reference

R. Alur and G. Taubenfeld, "Results about fast mutual exclusion"

Pseudocode: https://www.cs.rochester.edu/research/synchronization/pseudocode/fastlock.html#at
