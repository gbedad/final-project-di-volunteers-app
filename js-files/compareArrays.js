import _ from 'lodash';

export function compareArrays(arr1, arr2) {
  return _.differenceWith(arr1, arr2);
}

export function compareStrings(str1, str2) {
  return str1 === str2;
}

// const array1 = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
// const array2 = [{ id: 1, name: 'John' }, { id: 3, name: 'Alice' }];

// const differences = compareArrays(array1, array2);
// console.log(differences);
