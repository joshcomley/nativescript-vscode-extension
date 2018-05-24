import * as vscode from 'vscode';
import {CliVersion} from './project/nativeScriptCli';
import {Services} from './services/extensionHostServices';
import {Project} from './project/project';
import {IosProject} from './project/iosProject';
import {AndroidProject} from './project/androidProject';
import * as utils from './common/utilities';

// this method is called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
    Services.globalState = context.globalState;
    Services.cliPath = Services.workspaceConfigService().tnsPath || Services.cliPath;
    Services.extensionServer().start();
    Services.analyticsService().initialize();

    // Check for newer extension version
    Services.extensionVersionService().isLatestInstalled.then(result => {
        if (!result.result) {
            vscode.window.showWarningMessage(result.error);
        }
    });

    // Check if NativeScript CLI is installed globally and if it is compatible with the extension version
    let cliVersion = Services.cli().version;
    if (!cliVersion.isCompatible) {
        vscode.window.showErrorMessage(cliVersion.errorMessage);
    }

    let channel = createInfoChannel(cliVersion.version.toString());
    let showOutputChannelCommand = vscode.commands.registerCommand('nativescript.showOutputChannel', () => {
        channel.show();
    });

    let runCommand = (project: Project) => {
        if (vscode.workspace.rootPath === undefined) {
            vscode.window.showErrorMessage('No workspace opened.');
            return;
        }

        // Show output channel
        let runChannel: vscode.OutputChannel = vscode.window.createOutputChannel(`Run on ${project.platformName()}`);
        runChannel.clear();
        runChannel.show(vscode.ViewColumn.Two);

        Services.analyticsService().runRunCommand(project.platformName());

        let tnsProcess = project.run();
        tnsProcess.on('error', err => {
            vscode.window.showErrorMessage('Unexpected error executing NativeScript Run command.');
        });
        tnsProcess.stderr.on('data', data => {
            runChannel.append(data.toString());
        });
        tnsProcess.stdout.on('data', data => {
            runChannel.append(data.toString());
        });
        tnsProcess.on('exit', exitCode => {
            tnsProcess.stdout.removeAllListeners('data');
            tnsProcess.stderr.removeAllListeners('data');
        });
        tnsProcess.on('close', exitCode => {
            runChannel.hide();
        });

        context.subscriptions.push({
            dispose: () => utils.killProcess(tnsProcess)
        });
    };

    let runIosCommand = vscode.commands.registerCommand('nativescript.runIos', () => {
        return runCommand(new IosProject(vscode.workspace.rootPath, Services.cli()));
    });

    let runAndroidCommand = vscode.commands.registerCommand('nativescript.runAndroid', () => {
        return runCommand(new AndroidProject(vscode.workspace.rootPath, Services.cli()));
    });

    context.subscriptions.push(runIosCommand);
    context.subscriptions.push(runAndroidCommand);
    context.subscriptions.push(showOutputChannelCommand);
}

function createInfoChannel(cliVersion: string): vscode.OutputChannel {
    let channel = vscode.window.createOutputChannel("NativeScript Extension");
    const packageJSON = vscode.extensions.getExtension("Telerik.nativescript").packageJSON;

    packageJSON.version && channel.appendLine(`Version: ${packageJSON.version}`);
    packageJSON.buildVersion && channel.appendLine(`Build version: ${packageJSON.buildVersion}`);
    packageJSON.commitId && channel.appendLine(`Commit id: ${packageJSON.commitId}`);
    channel.appendLine(`NativeScript CLI: ${cliVersion}`);

    return channel;
}

export function deactivate() {
    Services.extensionServer().stop();
}