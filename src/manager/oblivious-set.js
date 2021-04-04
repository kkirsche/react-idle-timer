/**
 * this is a set which automatically forgets
 * a given entry when a new entry is set and the ttl
 * of the old one is over
 * @constructor
 */
const ObliviousSet = function (ttl) {
  const set = new Set()
  const timeMap = new Map()

  this.has = set.has.bind(set)

  this.add = function (value) {
    timeMap.set(value, now())
    set.add(value)
    _removeTooOldValues()
  }

  this.clear = function () {
    set.clear()
    timeMap.clear()
  }

  function _removeTooOldValues () {
    const olderThen = now() - ttl
    const iterator = set[Symbol.iterator]()

    while (true) {
      const value = iterator.next().value
      if (!value) return // no more elements
      const time = timeMap.get(value)
      if (time < olderThen) {
        timeMap.delete(value)
        set.delete(value)
      } else {
        // we reached a value that is not old enough
        return
      }
    }
  }
}

function now () {
  return new Date().getTime()
}

export default ObliviousSet
