import RNFB from 'rn-fetch-blob';
import {
  PackagesState,
  Tracker,
  BooksState,
  packageSetupProtocol,
  Package,
  loadJSONFile,
  downloadBundle,
  getFullBookList,
  requestNewBundle,
  getLocalBookList,
  FILE_DIRECTORY, calculateBooksToDownload, calculateBooksToDelete, autoUpdateCheck
} from '../DownloadControl'
import AsyncStorage from '@react-native-community/async-storage';
import Sefaria from '../sefaria'


const tocJson = [
  {
    contents: [
      'Genesis',
      'Exodus',
      'Leviticus',
      'Rashi on Genesis',
      'Rashi on Exodus',
      'Rashi on Leviticus',
      'Weird Random Book'
    ].map(x => {
      return {title: x}
    })
  }
];

const lastUpdated = {
  schema_version: 6,
  comment: "",
  titles: {}
};
let yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
[  // set the dates to yesterday
    "Genesis",
    "Exodus",
    "Leviticus",
    "Rashi on Genesis",
    "Rashi on Exodus",
    "Rashi on Leviticus",
    "Weird Random Book",
  ].map(x => lastUpdated.titles[x] = yesterday.toISOString());
const packageData = [
  {
    en: "COMPLETE LIBRARY",
    he: "כל הספרייה",
    color: "Other",
    size: 10
  },
  {
    en: "Gen with Rashi",
    he: 'בראשית עם רש"י',
    color: "Blue",
    parent: "Torah with Rashi",
    indexes: [
      "Genesis",
      "Rashi on Genesis",
    ],
    size: 2
  },
  {
    en: "Torah with Rashi",
    he: 'תורה עם רש"י',
    color: "Blue",
    indexes: [
      "Genesis",
      "Exodus",
      "Leviticus",
      "Rashi on Genesis",
      "Rashi on Exodus",
      "Rashi on Leviticus"
    ],
    size: 5
  }
];

fetch = jest.fn(x => {
  return Promise.resolve({status: 200, ok: true, json: async () => Promise.resolve({})})
});

beforeEach(async () => {
  await RNFB.fs.writeFile(`${FILE_DIRECTORY}/toc.json`, tocJson);
  // await Sefaria._loadTOC();
  Sefaria.booksDict = {};
  [
    'Genesis',
    'Exodus',
    'Leviticus',
    'Rashi on Genesis',
    'Rashi on Exodus',
    'Rashi on Leviticus',
    'Weird Random Book'
    ].map(x => Sefaria.booksDict[x] = 1);
  await RNFB.fs.writeFile(`${FILE_DIRECTORY}/packages.json`, packageData);
});

afterEach(async () => {
  await RNFB.fs.clear();
  await AsyncStorage.clear();
});

describe('InitializationTests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('NoPackagesSelected', async () => {
    await packageSetupProtocol();
    expect(Object.values(PackagesState)).toHaveLength(3);
    Object.values(PackagesState).forEach(p => {
      expect(p).toBeInstanceOf(Package)
    });
    expect(PackagesState).toHaveProperty("Torah with Rashi");
    expect(PackagesState["Torah with Rashi"].parent).toEqual("COMPLETE LIBRARY");
    expect(BooksState.Genesis.desired).toBe(false)

  });

  test('PackageSelected', async () => {
    await AsyncStorage.setItem('packagesSelected', JSON.stringify({
      "Gen with Rashi": true
    }));
    await packageSetupProtocol();
    expect(BooksState.Genesis.desired).toBe(true);
    expect(BooksState.Exodus.desired).toBe(false);
    expect(BooksState['Weird Random Book'].desired).toBe(false);
  });

  test('CompleteLibraryTest', async () => {
    await AsyncStorage.setItem('packagesSelected', JSON.stringify({
      'COMPLETE LIBRARY': true
    }));
    await packageSetupProtocol();
    expect(BooksState.Genesis.desired).toBe(true);
    expect(BooksState.Exodus.desired).toBe(true);
    expect(BooksState["Weird Random Book"].desired).toBe(true);
    expect(PackagesState["COMPLETE LIBRARY"].clicked).toBe(true);
    expect(PackagesState["COMPLETE LIBRARY"].supersededByParent).toBe(false);
    expect(PackagesState["Torah with Rashi"].supersededByParent).toBe(true);
  });
  test('Package Selections Stable', async () => {
    const selection = {"Gen with Rashi": true};
    await AsyncStorage.setItem('packagesSelected', JSON.stringify(selection));
    await packageSetupProtocol();
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);  // should only be called here
    const retrievedSelection = await AsyncStorage.getItem('packagesSelected');
    expect(JSON.parse(retrievedSelection)).toEqual(selection);
  });
  test('Bad Data Correction', async () => {
    const selection = {
      "Torah with Rashi": true,
      "Gen with Rashi": true,  // child of Torah with Rashi, should be purged
    };
    await AsyncStorage.setItem('packagesSelected', JSON.stringify(selection));
    await packageSetupProtocol();
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
    const retrievedSelection = await AsyncStorage.getItem('packagesSelected');
    expect(JSON.parse(retrievedSelection)).toEqual({"Torah with Rashi": true});
  })
});

describe('UpdateTests', () => {
  async function fileSetup(packageName) {
    // Selects the package and write the file to disk
    await AsyncStorage.setItem('packagesSelected', JSON.stringify({
      [packageName]: true
    }));
    const relevantPackage = packageData.find(p => p['en'] === packageName);
    const bookPromises = relevantPackage.indexes.map(x => {
      RNFB.fs.writeFile(`${FILE_DIRECTORY}/${x}.zip`, 'foo')
    });
    await Promise.all(bookPromises);
  }
  async function basicTest(expectedDownloads, expectedDeletes) {
    // sanity check that our mock is not throwing out a default value. package.json should be on disk before every test
    const [preFiles, preStat] =  await Promise.all([RNFB.fs.ls(FILE_DIRECTORY), RNFB.fs.lstat(FILE_DIRECTORY)]);
    expect(preFiles.length).toBeGreaterThan(0);
    expect(preStat.length).toBeGreaterThan(0);

    await packageSetupProtocol();
    const [toDownload, toDelete] = await Promise.all([calculateBooksToDownload(BooksState), calculateBooksToDelete(BooksState)]);
    const postFiles = await RNFB.fs.ls(FILE_DIRECTORY);
    expect(toDownload).toHaveLength(expectedDownloads);
    expect(toDelete).toHaveLength(expectedDeletes);
    expect(postFiles).toEqual(preFiles);
  }
  beforeEach(async () => {
    await RNFB.fs.writeFile(`${FILE_DIRECTORY}/last_updated.json`, lastUpdated);
  });
  afterEach(async () => {
    AsyncStorage.clear();
    RNFB.fs.clear();
    jest.clearAllMocks();
  });
  test('noDownloads', async () => {
    await basicTest(0, 0);
  });
  test("noUpdates", async () => {
    await fileSetup("Gen with Rashi");
    await basicTest(0, 0);
  });
  test('missingBook', async () => {
    await fileSetup("Gen with Rashi");
    await RNFB.fs.unlink(`${FILE_DIRECTORY}/Genesis.zip`);
    await basicTest(1, 0)
  });
  test('bookOutOfDate', async () => {
    await fileSetup("Gen with Rashi");
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    RNFB.fs.setTimestamp(`${FILE_DIRECTORY}/Genesis.zip`, lastWeek.valueOf());
    await basicTest(1, 0)
  });
  test('bookToDelete', async () => {
    await RNFB.fs.writeFile(`${FILE_DIRECTORY}/Genesis.zip`, 'foo');
    await basicTest(0, 1)
  });
  test('deleteUpdateMissing', async () => {
    await fileSetup("Torah with Rashi");
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    RNFB.fs.setTimestamp(`${FILE_DIRECTORY}/Genesis.zip`, lastWeek.valueOf());
    await RNFB.fs.unlink(`${FILE_DIRECTORY}/Exodus.zip`);
    await RNFB.fs.writeFile(`${FILE_DIRECTORY}/Weird Random Book.zip`);
    await basicTest(2, 1)
  });
  test('MissingCompleteLibrary', async () => {
    await AsyncStorage.setItem('packagesSelected', JSON.stringify({
      'COMPLETE LIBRARY': true
    }));
    await basicTest(7, 0);
  });
  test('CompleteLibraryMissingUpdate', async () => {
    await AsyncStorage.setItem('packagesSelected', JSON.stringify({
      'COMPLETE LIBRARY': true
    }));
    await RNFB.fs.writeFile(`${FILE_DIRECTORY}/Genesis.zip`, 'foo');
    await RNFB.fs.writeFile(`${FILE_DIRECTORY}/Exodus.zip`, 'foo');
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    RNFB.fs.setTimestamp(`${FILE_DIRECTORY}/Exodus.zip`, lastWeek.valueOf());
    await basicTest(6, 0);
  });
  test('requestNewBundle', async () => {
    // check that the method retries after server failure
    fetch.mockImplementationOnce(x => Promise.resolve({status: 202, ok: true}));
    await requestNewBundle(['Genesis', 'Job'], 1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('lastUpdated', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  const setDate = async daysAgo => {
    let d = new Date();
    d.setDate(d.getDate() - daysAgo);
    await AsyncStorage.setItem('lastUpdateCheck', d.toJSON());
  };
  const setup = async () => {
    await AsyncStorage.setItem('packagesSelected', JSON.stringify({
      'COMPLETE LIBRARY': true
    }));
    await packageSetupProtocol();
  };
  test('noLibrary', async () => {
    await packageSetupProtocol();
    const requiresUpdate = await autoUpdateCheck();
    expect(requiresUpdate).toBe(false);
  });
  test('updatedRecently', async () => {
    await setup();
    await setDate(1);
    const requiresUpdate = await autoUpdateCheck();
    expect(requiresUpdate).toBe(false);
  });
  test('updatedALongTimeAgo', async () => {
    await setup();
    await setDate(10);
    const requiresUpdate = await autoUpdateCheck();
    expect(requiresUpdate).toBe(true);
  });
});

test('getLocalBookList', async () => {
  await Promise.all([
    RNFB.fs.writeFile(`${FILE_DIRECTORY}/Genesis.zip`, '123'),
    RNFB.fs.writeFile(`${FILE_DIRECTORY}/Berakhot.zip`, '456'),
    RNFB.fs.writeFile(`${FILE_DIRECTORY}/Midrash Rabbah.zip`, '789')
  ]);
  const result = await getLocalBookList();
  expect(result).toEqual(['Genesis', 'Berakhot', 'Midrash Rabbah']);
});

describe('testMocking', () => {
  // These tests are sanity checks to make sure the mocks are behaving as intended
  test('readWrite', async () => {
    await RNFB.fs.writeFile('foo/bar', 'some random stuff');
    const result = await loadJSONFile('foo/bar');
    expect(result).toBe('some random stuff')
  });
  test('singleMock', async () => {
    // We want to verify we are properly using mockImplementationOnce
    let result = await RNFB.fs.lstat();
    const mockResult = [{
      'Genesis.zip': 'foo'
    }];
    expect(result).toEqual([]);
    RNFB.fs.lstat.mockImplementationOnce(x => Promise.resolve(mockResult));
    result = await RNFB.fs.lstat();
    expect(result).toBe(mockResult);
    result = await RNFB.fs.lstat();
    expect(result).toEqual([]);
  });
  test('stat', async () => {
    await RNFB.fs.writeFile('/foo', 'bar');
    const stat = await RNFB.fs.stat('/foo');
    expect(stat).toBeInstanceOf(Object);
    expect(stat).toHaveProperty('lastModified');
    expect(stat).toHaveProperty('filename')
  });
  test('lstat', async () => {
    // mocking Date.now so to prevent weird off-by-one errors that pop up.
    const filePromises = ['/foo/a', '/foo/b', '/foo/c'].map(x => {
      RNFB.fs.writeFile(`${x}`, 'foo');
    });
    await Promise.all(filePromises);
    const lstatResults = await RNFB.fs.lstat('/foo');
    const fileBStat = await RNFB.fs.stat('/foo/b');
    expect(lstatResults).toBeInstanceOf(Array);
    expect(lstatResults).toHaveLength(3);
    delete fileBStat['lastModified'];  // these cause annoying off-by-1 errors on occasion
    delete lstatResults[1]['lastModified'];
    expect(lstatResults[1]).toEqual(fileBStat);
  });
  test('customTimestamp', async () => {
    await RNFB.fs.writeFile('/foo/bar', 'blablabla');
    const someTime = new Date(123456);
    RNFB.fs.setTimestamp('/foo/bar', someTime);
    const stat = await RNFB.fs.stat('/foo/bar');
    expect(stat.lastModified).toBe(someTime.valueOf());
  });
  test('fetchMocks', async () => {
    fetch.mockImplementationOnce(x => Promise.resolve({status: 404}));
    let fetchResponse;
    fetchResponse = await fetch('foo');
    expect(fetchResponse.status).toBe(404);
    fetchResponse = await fetch('foo');
    expect(fetchResponse.status).toBe(200);
    const j = await fetchResponse.json();
    expect(j).toEqual({});
  });
});

