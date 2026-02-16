####FolderView3###
FolderView3 lets you create folders for grouping Dockers and VMs together to help with organization. Especially useful if you're using docker-compose.
Getting Started: A new button named "Add Folder" will appear at the bottom of the docker/VM tab next to "Add Container/VM".
<script src="/plugins/folder.view3/scripts/include/CLDRPluralRuleParser.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.messagestore.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.fallbacks.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.language.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.parser.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.emitter.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.emitter.bidi.js"></script>
<script id="folderview3-script">const i18nc = {'locale': document.documentElement.lang};const i18nl = {'en': '/plugins/folder.view3/langs/en.json'};i18nl[`${document.documentElement.lang}`] = `/plugins/folder.view3/langs/${document.documentElement.lang}.json`;$.i18n(i18nc).load(i18nl).then(() => {$('#folderview3-script').parent()[0].childNodes[0].nodeValue = $.i18n('folderview3-desc')}, ()=>{});</script>