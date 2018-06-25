import CleanQuery from './helpers/CleanQuery';
import ConstructQueryChildren from './helpers/ConstructQueryChildren';
import ConstructResponsePath from './helpers/ConstructResponsePath';
import CreateCallbacksForPartialQueryValidation from './helpers/CreateCallbacksForPartialQueryValidation';
import Denormalize from './helpers/Denormalize';
import Fetch from './helpers/Fetch';
import Flatten from './helpers/Flatten';

export default class Flache {
  constructor(props) {
    this.cache = {};
    this.queryCache = {};
    this.fieldsCache = [];
    this.cacheLength = 0;
    this.cacheExpiration = 1000 * 120;
    this.cbs;
    this.options = {
      paramRetrieval: false,
      fieldRetrieval: false,
      subsets: {},
    };
  }

  saveToSessionStorage() {
    Object.keys(this).forEach(key => sessionStorage.setItem(key, JSON.stringify(this[key])));
    setTimeout(() => sessionStorage.clear(), 200000);
  }

  readFromSessionStorage() {
    Object.keys(this).forEach((key) => { if (sessionStorage.getItem(key)) this[key] = JSON.parse(sessionStorage.getItem(key)); });
  }

  it(
    query,
    variables,
    endpoint,
    headers = { "Content-Type": "application/graphql" },
    options
  ) {
    console.log('flache.it called, import test, fetch func: ', Fetch);
    // create a key to store the payloads in the cache
    const stringifiedQuery = JSON.stringify(query);
    this.queryParams = CleanQuery(query);
    console.log('testing flache, query params: ', this.queryParams);

    // create a children array to check params
    this.children = ConstructQueryChildren(query);
    console.log('testing, children array ', this.children);
    // if an identical query comes in return the cached result
    if (this.cache[stringifiedQuery]) {
      return new Promise((resolve) => {
        console.log('resolving from cache')
        resolve(this.cache[stringifiedQuery]);
      });
    }

    // set boolean to check for partial queries, else skip straight to fetch and return
    if (options.paramRetrieval) this.options.paramRetrieval = true;
    if (options.fieldRetrieval) this.options.fieldRetrieval = true;
    else return Fetch(query, endpoint, headers, stringifiedQuery);

    // save subsets to state
    if (options.defineSubsets) this.options.subsets = options.defineSubsets;

    // returns an object of callback functions that check query validity using subset options
    if (!this.cbs) {
        this.cbs = CreateCallbacksForPartialQueryValidation(
          this.options.subsets
        );
    }

    // create a boolean to check if all queries are subsets of others
    let allQueriesPass = false;

    // increment cache length
    this.cacheLength = Object.keys(this.cache).length;
    
    // if the developer specifies in App.jsx
    if (this.options.paramRetrieval) {
        let childrenMatch = false;
        //check if query children match
        childrenMatch = this.fieldsCache.some(obj => {
            let objChildren = Object.values(obj)[0].children
            return objChildren.every(child => this.children.includes(child)) && this.children.every(child => objChildren.includes(child))
        })
        // no need to run partial query check on first query
        if (childrenMatch) {
            if (this.cacheLength > 0) {
                let currentMatchedQuery;
                for (let key in variables) {
                    for (let query in this.queryCache[key]) {
                        if (this.cbs[this.options.subsets[key]](variables[key], this.queryCache[key][query])) {
                        // if the callback returns true, set the currentMatchedQuery to be the current query
                        currentMatchedQuery = query;
                        } else {
                            continue;
                        }

                        for (let currentKey in this.queryCache) {
                            // skip the first key since this is the one that just matched
                            if (key === currentKey) continue;

                            /* run the value on that query on each callback 
                            such that if the callback of the current symbol passes
                            given the current query variable as the first argument, 
                            and the cached value on the current matched query key as the second,
                            the queriesPass boolean is set to the return value of the callback */
                            let rule = this.options.subsets[currentKey];
                            let arg1 = variables[currentKey];
                            let arg2 = this.queryCache[currentKey][currentMatchedQuery];
                            let result = this.cbs[rule](arg1, arg2);
      
                            if (result) {
                                allQueriesPass = result;
                            } else {
                                allQueriesPass = false;
                                break;
                            }
                        }

                        if (allQueriesPass) {
                            let pathToNodes = options.pathToNodes;
                            let cached = Object.assign(this.cache[currentMatchedQuery], {});
                            let { path, lastTerm } = ConstructResponsePath(pathToNodes, cached)
            
                            for (let key in options.queryPaths) {
                            path[lastTerm] = path[lastTerm].filter(el => {
                                let { path, lastTerm } = ConstructResponsePath(options.queryPaths[key], el)
                                return this.cbs[this.options.subsets[key]](path[lastTerm], variables[key])
                            });
                            }
                            return new Promise((resolve, reject) => {
                                resolve(cached);
                            });
                        }
                    }
                }
            }
        }
    }

    Object.keys(variables).forEach(queryVariable => {
    // if a key already exists on the query cache for that variable add a new key value pair to it, else create a new obj
    if (this.queryCache[queryVariable]) {
        this.queryCache[queryVariable][stringifiedQuery] =
        variables[queryVariable];
    } else
        this.queryCache[queryVariable] = {
        [stringifiedQuery]: variables[queryVariable]
        };
    });
 
    if (this.options.fieldRetrieval) {
        let filtered;
        let foundMatch = false;
        this.fieldsCache.forEach((node) => {
            if (node.hasOwnProperty(this.queryParams)) {
                foundMatch = this.children.every(child => {
                    return node[this.queryParams].children.includes(child);
                })
                if (foundMatch) {
                    filtered = Object.assign({}, node[this.queryParams].data);
                    for (let key in filtered) {
                        if (!this.children.some(child => key.includes(child)) ) {
                            delete filtered[key];
                        }
                    }
                }
           }
        })

        if (foundMatch) {
            return new Promise((resolve) => {
                filtered = Denormalize(filtered);
                resolve(filtered);
              });
        }
    } else {
        //if partial retrieval is off, return cached object or fetch
        if (this.cache[stringifiedQuery]) {
        return new Promise((resolve) => {
            return resolve(this.cache[stringifiedQuery]);
        });
        } else {
            return Fetch(query, endpoint, headers, stringifiedQuery);
        } 
    }
    return Fetch(query, endpoint, headers, stringifiedQuery);
  }
}

