// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

// @ts-check

describe('Preferences', function () {
    this.timeout(5_000);
    const { assert } = chai;
    const { PreferenceProvider } = require('@theia/core/lib/browser/preferences/preference-provider');
    const { PreferenceService, PreferenceScope } = require('@theia/core/lib/browser/preferences/preference-service');
    const { FileService } = require('@theia/filesystem/lib/browser/file-service');
    const { PreferenceLanguageOverrideService } = require('@theia/core/lib/browser/preferences/preference-language-override-service');
    const { MonacoTextModelService } = require('@theia/monaco/lib/browser/monaco-text-model-service');
    const { container } = window.theia;
    /** @type {import ('@theia/core/lib/browser/preferences/preference-service').PreferenceService} */
    const preferenceService = container.get(PreferenceService);
    const overrideService = container.get(PreferenceLanguageOverrideService);
    const fileService = container.get(FileService);
    /** @type {import ('@theia/core/lib/common/uri').default} */
    const uri = preferenceService.getConfigUri(PreferenceScope.Workspace);
    /** @type {import('@theia/preferences/lib/browser/folders-preferences-provider').FoldersPreferencesProvider} */
    const folderPreferences = container.getNamed(PreferenceProvider, PreferenceScope.Folder);
    const modelService = container.get(MonacoTextModelService);

    const swift = 'swift'; // Probably not in our preference files...
    const tabSize = 'editor.tabSize';
    const fontSize = 'editor.fontSize';
    const override = overrideService.markLanguageOverride(swift);
    const overriddenTabSize = overrideService.overridePreferenceName({ overrideIdentifier: swift, preferenceName: tabSize });
    const overriddenFontSize = overrideService.overridePreferenceName({ overrideIdentifier: swift, preferenceName: fontSize });
    /**
     * @returns {Promise<Record<string, any>>}
     */
    async function getPreferences() {
        try {
            const content = (await fileService.read(uri)).value;
            return JSON.parse(content);
        } catch (e) {
            return {};
        }
    }

    /**
     * @param {string} key
     * @param {unknown} value
     */
    async function setPreference(key, value) {
        return preferenceService.set(key, value, PreferenceScope.Workspace);
    }

    async function deleteAllValues() {
        const reference = await modelService.createModelReference(uri);
        if (reference.object.dirty) {
            await reference.object.revert();
        }
        /** @type {import ('@theia/preferences/lib/browser/folder-preference-provider').FolderPreferenceProvider} */
        const provider = Array.from(folderPreferences['providers'].values()).find(candidate => candidate.getConfigUri().isEqual(uri));
        assert.isDefined(provider);
        await provider['doSetPreference']('', [], undefined);
        reference.dispose();
    }

    let fileExistsBeforehand = false;
    let contentBeforehand = '';

    before(async function () {
        assert.isDefined(uri, 'The workspace config URI should be defined!');
        fileExistsBeforehand = await fileService.exists(uri);
        contentBeforehand = await fileService.read(uri).then(({ value }) => value).catch(() => '');
        await deleteAllValues();
    });

    after(async function () {
        if (!fileExistsBeforehand) {
            await fileService.delete(uri, { fromUserGesture: false }).catch(() => { });
        } else {
            await fileService.write(uri, contentBeforehand);
        }
    });

    beforeEach(async function () {
        const prefs = await getPreferences();
        for (const key of [tabSize, fontSize, override, overriddenTabSize, overriddenFontSize]) {
            shouldBeUndefined(prefs[key], key);
        }
    });

    afterEach(async function () {
        await deleteAllValues();
    });

    /**
     * @param {unknown} value
     * @param {string} key
     */
    function shouldBeUndefined(value, key) {
        assert.isUndefined(value, `There should be no ${key} object or value in the preferences.`);
    }

    /**
     * @returns {Promise<{newTabSize: number, newFontSize: number, startingTabSize: number, startingFontSize: number}>}
     */
    async function setUpOverride() {
        const startingTabSize = preferenceService.get(tabSize);
        const startingFontSize = preferenceService.get(fontSize);
        assert.equal(preferenceService.get(overriddenTabSize), startingTabSize, 'The overridden value should equal the default.');
        assert.equal(preferenceService.get(overriddenFontSize), startingFontSize, 'The overridden value should equal the default.');
        const newTabSize = startingTabSize + 2;
        const newFontSize = startingFontSize + 2;
        await Promise.all([
            setPreference(overriddenTabSize, newTabSize),
            setPreference(overriddenFontSize, newFontSize),
        ]);
        assert.equal(preferenceService.get(overriddenTabSize), newTabSize, 'After setting, the new value should be active for the override.');
        assert.equal(preferenceService.get(overriddenFontSize), newFontSize, 'After setting, the new value should be active for the override.');
        return { newTabSize, newFontSize, startingTabSize, startingFontSize };
    }

    it('Sets language overrides as objects', async function () {
        const { newTabSize, newFontSize } = await setUpOverride();
        const prefs = await getPreferences();
        assert.isObject(prefs[override], 'The override should be a key in the preference object.');
        assert.equal(prefs[override][tabSize], newTabSize, 'editor.tabSize should be a key in the override object and have the correct value.');
        assert.equal(prefs[override][fontSize], newFontSize, 'editor.fontSize should be a key in the override object and should have the correct value.');
        shouldBeUndefined(prefs[overriddenTabSize], overriddenTabSize);
        shouldBeUndefined(prefs[overriddenFontSize], overriddenFontSize);
    });

    it('Allows deletion of individual keys in the override object.', async function () {
        const { startingTabSize } = await setUpOverride();
        await setPreference(overriddenTabSize, undefined);
        assert.equal(preferenceService.get(overriddenTabSize), startingTabSize);
        const prefs = await getPreferences();
        shouldBeUndefined(prefs[override][tabSize], tabSize);
        shouldBeUndefined(prefs[overriddenFontSize], overriddenFontSize);
        shouldBeUndefined(prefs[overriddenTabSize], overriddenTabSize);
    });

    it('Allows deletion of the whole override object', async function () {
        const { startingFontSize, startingTabSize } = await setUpOverride();
        await setPreference(override, undefined);
        assert.equal(preferenceService.get(overriddenTabSize), startingTabSize, 'The overridden value should revert to the default.');
        assert.equal(preferenceService.get(overriddenFontSize), startingFontSize, 'The overridden value should revert to the default.');
        const prefs = await getPreferences();
        shouldBeUndefined(prefs[override], override);
    });
});
