#!/usr/bin/env node
/** 用真实浏览器、HTTP、持久记录和CSV验证样例及两项坏例；只回收本次进程。 @author Pjh */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { forEachRequired } = require('./required-collection.cjs');

/** 在产生输出前核对调用参数，帮助只读取入口。 @author Pjh */
function options(argv) {
    if (argv.length === 1 && argv[0] === '--help') {
        console.log('用法：node verify-example.cjs --output <新的绝对目录> --playwright-module <已有模块绝对路径> [--case healthy|missing-header|lost-write|all]');
        return null;
    }
    const values = { '--case': 'all' };
    for (let i = 0; i < argv.length; i += 2) {
        if (!['--output', '--playwright-module', '--case'].includes(argv[i]) || !argv[i + 1]) {
            throw new Error(`参数无效：${argv[i]}`);
        }
        values[argv[i]] = argv[i + 1];
    }
    for (const key of ['--output', '--playwright-module']) {
        if (!values[key] || !path.isAbsolute(values[key])) throw new Error(`${key}需要绝对路径`);
    }
    if (!['healthy', 'missing-header', 'lost-write', 'all'].includes(values['--case'])) throw new Error('--case无效');
    if (fs.existsSync(values['--output'])) throw new Error('输出目录已存在，需指定新目录以保留原件');
    return { output: values['--output'], module: values['--playwright-module'], selected: values['--case'] };
}

const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

/** 通过子进程首行就绪消息取得动态端口，启动失败保持原错误。 @author Pjh */
async function startServer(folder, mode) {
    const child = spawn('python3', [path.join(__dirname, '../assets/example-app/server.py'), '--data-dir', path.join(folder, 'data'), '--mode', mode, '--port', '0'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = fs.createWriteStream(path.join(folder, 'server.log'), { flags: 'wx' });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once('close', () => log.end());
    let line = '';
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('样例服务10秒内未就绪')), 10000);
        const done = (callback, value) => { clearTimeout(timer); callback(value); };
        child.once('error', error => done(reject, error));
        child.once('exit', code => done(reject, new Error(`样例服务在就绪前退出：${code}`)));
        child.stdout.on('data', chunk => {
            line += chunk.toString();
            if (line.includes('\n')) {
                try { done(resolve, JSON.parse(line.slice(0, line.indexOf('\n')))); }
                catch (error) { done(reject, error); }
            }
        });
    });
    return { child, ready };
}

/** 使用本次持有的句柄停止服务，并验证监听已关闭。 @author Pjh */
async function stopServer(server, url) {
    if (!server) return { stopped: true, started: false };
    const child = server.child;
    if (child.exitCode === null && child.signalCode === null) {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.kill('SIGTERM');
        });
    }
    let portClosed = true;
    if (url) {
        try { await fetch(url + '/health', { signal: AbortSignal.timeout(1000) }); portClosed = false; }
        catch { /* 进程已退出，连接失败是本次端口关闭的实际观察。 */ }
    }
    return { started: true, pid: child.pid, stopped: child.exitCode !== null || child.signalCode !== null, portClosed, exitCode: child.exitCode, signal: child.signalCode };
}

/** 各模式共享相同业务断言，只有样例服务模式不同。 @author Pjh */
async function runCase(chromium, output, name, mode) {
    const folder = path.join(output, name);
    fs.mkdirSync(folder);
    const result = { name, mode, scenarioStatus: 'FAIL', checks: [], cleanup: null };
    let stage = 'environment', server, browser, context, page, url, created;
    const network = [];
    async function getJSON(route) {
        const response = await fetch(url + route);
        const body = await response.text();
        network.push({ source: 'controller', method: 'GET', url: url + route, status: response.status, body });
        assert.equal(response.status, 200, `${route}应成功`);
        return JSON.parse(body);
    }
    try {
        server = await startServer(folder, mode);
        const ready = await server.ready;
        url = ready.url;
        result.runtime = ready;
        const health = await getJSON('/health');
        assert.equal(health.version, 'app-acceptance-example-v1');
        assert.equal(health.pid, server.child.pid);
        result.checks.push('实际健康版本和进程归属');
        browser = await chromium.launch({ headless: true, downloadsPath: path.join(folder, 'browser-downloads') });
        context = await browser.newContext({ viewport: { width: 1100, height: 800 }, acceptDownloads: true });
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        context.on('request', request => network.push({ source: 'browser', method: request.method(), url: request.url(), body: request.postData() }));
        context.on('response', response => network.push({ source: 'browser-response', url: response.url(), status: response.status() }));
        page = await context.newPage();
        await page.goto(url + '/');
        await page.waitForFunction(() => document.querySelector('#load-state')?.dataset.loaded === 'true');

        stage = 'required-headers';
        // 缺全部表头必须在此失败，空数据仍保留两列表头及明确空态。
        const headers = page.locator('thead th');
        result.headerCount = await forEachRequired(headers, '记录列表表头', async element => assert.ok((await element.innerText()).trim()));
        assert.deepEqual(await headers.allTextContents(), ['编号', '记录名称']);
        assert.equal(await page.locator('#empty-state').isVisible(), true);
        result.checks.push('空业务数据下必要表头存在且覆盖完整');
        await page.screenshot({ path: path.join(folder, 'default-entry.png'), fullPage: true });

        stage = 'create-http';
        const recordName = '验收记录，含"引号",CSV';
        await page.getByLabel('记录名称').fill(recordName);
        const responsePromise = page.waitForResponse(response => response.url() === url + '/api/records' && response.request().method() === 'POST');
        await page.getByRole('button', { name: '新增记录', exact: true }).click();
        const response = await responsePromise;
        assert.equal(response.status(), 201);
        const responseBody = await response.text();
        network.push({ source: 'create-response-body', url: response.url(), status: response.status(), body: responseBody });
        created = JSON.parse(responseBody);
        assert.equal(created.name, recordName);
        assert.equal(typeof created.id, 'string');
        await page.getByRole('cell', { name: recordName, exact: true }).waitFor({ state: 'visible' });
        result.createdRecord = created;
        result.checks.push('表单新增的实际POST及页面结果');
        await page.screenshot({ path: path.join(folder, 'created.png'), fullPage: true });

        stage = 'persistence-readback';
        // lost-write返回201并暂显记录；独立GET、刷新及持久文件仍须包含同一记录。
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#load-state')?.dataset.loaded === 'true');
        const independent = await getJSON('/api/records');
        result.independentReadback = independent;
        assert.deepEqual(independent.records, [created], '持久终态缺少已受理记录');
        assert.equal(await page.getByRole('cell', { name: recordName, exact: true }).count(), 1, '刷新后应显示同一记录');
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'data/records.json'), 'utf8')), [created]);
        result.checks.push('刷新、独立GET及持久文件同一记录');

        stage = 'export-file';
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('link', { name: '导出CSV', exact: true }).click();
        const download = await downloadPromise;
        assert.equal(await download.failure(), null);
        const csv = path.join(folder, 'records.csv');
        await download.saveAs(csv);
        const parsed = spawnSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1], encoding="utf-8", newline=""))), ensure_ascii=False))', csv], { env: process.env, encoding: 'utf8' });
        assert.equal(parsed.status, 0, parsed.stderr);
        result.csvRecords = JSON.parse(parsed.stdout);
        assert.deepEqual(result.csvRecords, [created]);
        result.checks.push('实际下载CSV并解析全部记录及特殊字符');
        result.scenarioStatus = 'PASS';
    } catch (error) {
        result.failure = { stage, message: error.message, stack: error.stack };
    } finally {
        try {
            if (page) await page.screenshot({ path: path.join(folder, 'final.png'), fullPage: true });
            if (context) await context.tracing.stop({ path: path.join(folder, 'trace.zip') });
        } catch (error) { result.captureError = error.message; }
        try { if (browser) await browser.close(); }
        catch (error) { result.browserCloseError = error.message; }
        try { result.cleanup = await stopServer(server, url); }
        catch (error) { result.cleanup = { stopped: false, error: error.message }; }
        writeJSON(path.join(folder, 'network.json'), network);
    }
    try {
        assert.equal(result.cleanup.stopped, true);
        if (result.cleanup.started) assert.equal(result.cleanup.portClosed, true);
        assert.equal(result.captureError, undefined);
        assert.equal(result.browserCloseError, undefined);
        for (const file of ['final.png', 'trace.zip', 'network.json', 'data/records.json', 'data/http.jsonl']) assert.ok(fs.statSync(path.join(folder, file)).size > 0, `原件缺失：${file}`);
        if (result.scenarioStatus === 'PASS') {
            assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, 'data/records.json'), 'utf8')), [created]);
            assert.ok(fs.readFileSync(path.join(folder, 'records.csv'), 'utf8').includes(created.id));
        }
        result.evidenceReadableAfterCleanup = true;
    } catch (error) {
        result.evidenceReadableAfterCleanup = false;
        if (result.scenarioStatus === 'PASS') result.failure = { stage: 'cleanup-evidence', message: error.message };
        result.scenarioStatus = 'FAIL';
        result.cleanupEvidenceError = error.message;
    }
    writeJSON(path.join(folder, 'result.json'), result);
    return result;
}

/** 分别记录实际场景终态与预期坏例检出，环境失败始终不能通过自检。 @author Pjh */
async function main() {
    const args = options(process.argv.slice(2));
    if (!args) return;
    const { chromium } = require(args.module);
    if (!chromium?.launch) throw new Error('指定模块没有Playwright chromium.launch');
    fs.mkdirSync(args.output);
    const definitions = [
        { name: 'healthy', mode: 'healthy' },
        { name: 'missing-header', mode: 'missing-header', failureStage: 'required-headers', errorText: '必要对象集合为空：记录列表表头' },
        { name: 'lost-write', mode: 'lost-write', failureStage: 'persistence-readback', errorText: '持久终态缺少已受理记录' },
        { name: 'healthy-recovery', mode: 'healthy' },
    ].filter(value => args.selected === 'all' || value.name === args.selected);
    const cases = [];
    for (const definition of definitions) {
        const actual = await runCase(chromium, args.output, definition.name, definition.mode);
        const expected = definition.failureStage ? 'FAIL' : 'PASS';
        const expectedOutcomeObserved = definition.failureStage
            ? actual.scenarioStatus === 'FAIL' && actual.failure?.stage === definition.failureStage && actual.failure.message.includes(definition.errorText)
            : actual.scenarioStatus === 'PASS';
        cases.push({ expectedScenarioStatus: expected, expectedFailureStage: definition.failureStage || null, expectedOutcomeObserved, ...actual });
    }
    const summary = { selected: args.selected, selfCheckStatus: cases.every(value => value.expectedOutcomeObserved && value.evidenceReadableAfterCleanup) ? 'PASS' : 'FAIL', cases };
    writeJSON(path.join(args.output, 'result.json'), summary);
    console.log(JSON.stringify({ output: args.output, selfCheckStatus: summary.selfCheckStatus, cases: cases.map(value => ({ name: value.name, scenarioStatus: value.scenarioStatus, expectedOutcomeObserved: value.expectedOutcomeObserved, failureStage: value.failure?.stage || null })) }, null, 2));
    process.exitCode = args.selected === 'all' ? (summary.selfCheckStatus === 'PASS' ? 0 : 1) : (cases[0].scenarioStatus === 'PASS' && cases[0].evidenceReadableAfterCleanup ? 0 : 1);
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
