# webstorage-mutex 🔒

[![npm version](https://badge.fury.io/js/webstorage-mutex.svg)](https://badge.fury.io/js/webstorage-mutex)

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
    repeatTimeout: 1000, // <- this should be the upper bound of your critical section
    delayTime: 50, // <- this is assumed to be long enough for any tab to complete localStorage getItem and setItem
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

Code to be executed by process i. Variables Y and Z are initialized to free and
0, respectively.
The delay at line 6 is assumed to be long enough for any process that has
already read Y = free in line 3 to complete line 4, and any process that has
already set Y in line 4 to complete line 5 and (if not delayed) line 11 (that is
the time required to service 2 memory references by all other processors in the
system).

```
  1:     start:
  2:        X := i
  3:        repeat until Y = free
  4:        Y := i
  5:        if X <> i
  6:           { delay }
  7:           if Y <> i
  8:              goto start
  9:           repeat until Z = 0
  10:       else
  11:          Z := 1
  12:    { critical section }
  13:       Z := 0
  14:       if Y = i
  15:          Y := free
  16:    { non-critical section }
  17:       goto start
```
