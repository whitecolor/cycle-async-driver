import {run} from '@cycle/core'
import {createDriver} from '../lib/index'
import {Observable as O} from 'rx'
import isolate from '@cycle/isolate'
import test from 'tape'

var simpleDriver = createDriver((request) =>
  O.create(observer => {
    setTimeout(() => observer.onNext('async ' + request.name), 10)
  })
)

var asyncDriver = createDriver({
  createResponse$: (request) =>
    O.create(observer => {
      setTimeout(() => observer.onNext({asyncName: 'async ' + request.name}), 10)
    }),
  requestProp: 'query',
  normalizeRequest: (name) =>
    typeof name ==='string'
      ? {name: name.toUpperCase()}
      : {...name, name: name.name.toUpperCase()},
  isolateProp: '_scope',
  isolateMap: (name) =>
    typeof name === 'string' ? {name} : name
})

test('Check basic request with simple driver', (t) => {
  const main = ({async}) => {
    return {
      async: O.just({name: 'John'}),
      result: async.switch()
    }
  }
  run(main, {
    async: simpleDriver,
    result: (response$) => {
      response$.subscribe(r => {
        t.is(r, 'async John')
        t.end()
      })
    }
  })
})

test('Check basic request', (t) => {
  const main = ({async}) => {
    return {
      async: O.just('John'),
      result: async.switch()
    }
  }
  run(main, {
    async: asyncDriver,
    result: (response$) => {
      response$.subscribe(r => {
        t.is(r.asyncName, 'async JOHN')
        t.end()
      })
    }
  })
})

test('Check two isolated requests', (t) => {
  const SendQuery = ({params, async}) => {
    return {
      async: O.just(params),
      result: async
    }
  }
  const main = ({async}) => {
    let query1 = isolate(SendQuery)({params: {name: 'John'}, async})
    let query2 = isolate(SendQuery)({params: 'Jane', async})
    return {
      async: O.merge(query1.async, query2.async.delay(1)),
      result: O.merge([
        query1.result, query2.result
      ]).flatMap(r$ => r$.do(r => r.query = r$.query))
    }
  }
  let count = 0
  run(main, {
    async: asyncDriver,
    result: (response$) => {
      response$.forEach(r => {
        if (r.asyncName == 'async JOHN'){
          t.is(r.query.name, 'JOHN', 'custom `query` request property has normalized request')
          t.ok(r.query._scope, 'custom `_scope` property is ok')
        }
        if (r.asyncName == 'async JANE'){
          t.is(r.query.name, 'JANE', 'custom `query` request property has normalized request')
          t.ok(r.query._scope, 'custom `_scope` property is ok')
        }
        if (++count === 2){
          setTimeout(() => {
            t.is(count, 2, 'responses count is ok, isolation is ok')
            t.end()
          })
        }
      })
    }
  })
})