'use strict';
/** 将必要集合的存在、可见性与逐项检查绑定，空集合明确失败。 @author Pjh */
async function forEachRequired(locator, label, checkItem) {
    const count = await locator.count();
    if (count === 0) throw new Error(`必要对象集合为空：${label}`);
    for (let index = 0; index < count; index += 1) {
        const element = locator.nth(index);
        if (!await element.isVisible()) throw new Error(`必要对象不可见：${label}[${index}]`);
        await checkItem(element, index);
    }
    return count;
}

module.exports = { forEachRequired };
