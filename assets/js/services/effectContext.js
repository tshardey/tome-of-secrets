/**
 * Build the adapter-like object EffectRegistry / pipeline expect (state + form selections).
 * @param {{ state: Object }} stateAdapter
 * @param {HTMLFormElement|null} [form]
 * @returns {{ state: Object, formData: { keeperBackground: string, wizardSchool: string } }}
 */
export function buildEffectContext(stateAdapter, form = null) {
    const keeperEl =
        form?.querySelector('#keeperBackground') ??
        (typeof document !== 'undefined' ? document.getElementById('keeperBackground') : null);
    const schoolEl =
        form?.querySelector('#wizardSchool') ??
        (typeof document !== 'undefined' ? document.getElementById('wizardSchool') : null);
    return {
        state: stateAdapter?.state || {},
        formData: {
            keeperBackground: keeperEl?.value || '',
            wizardSchool: schoolEl?.value || ''
        }
    };
}
