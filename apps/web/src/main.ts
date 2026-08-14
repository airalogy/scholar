import { createApp } from 'vue'
import {
  Button,
  Checkbox,
  ConfigProvider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Tabs,
  Textarea,
  Tooltip,
  Upload,
} from '@arco-design/web-vue'
import '@arco-design/web-vue/es/button/style/css.js'
import '@arco-design/web-vue/es/checkbox/style/css.js'
import '@arco-design/web-vue/es/config-provider/style/css.js'
import '@arco-design/web-vue/es/empty/style/css.js'
import '@arco-design/web-vue/es/form/style/css.js'
import '@arco-design/web-vue/es/input/style/css.js'
import '@arco-design/web-vue/es/input-number/style/css.js'
import '@arco-design/web-vue/es/message/style/css.js'
import '@arco-design/web-vue/es/modal/style/css.js'
import '@arco-design/web-vue/es/pagination/style/css.js'
import '@arco-design/web-vue/es/popconfirm/style/css.js'
import '@arco-design/web-vue/es/select/style/css.js'
import '@arco-design/web-vue/es/spin/style/css.js'
import '@arco-design/web-vue/es/tabs/style/css.js'
import '@arco-design/web-vue/es/textarea/style/css.js'
import '@arco-design/web-vue/es/tooltip/style/css.js'
import '@arco-design/web-vue/es/upload/style/css.js'
import './theme/design-tokens.sass'
import './theme/arco-overrides.sass'
import './style.sass'

import App from './App.vue'
import i18n from './i18n'
import router from './router'
import { ensurePublicConfigLoaded } from './composables/usePublicConfig'

async function loadConfig() {
  await ensurePublicConfigLoaded()
}
loadConfig()

const app = createApp(App)

for (const component of [
  Button,
  Checkbox,
  ConfigProvider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Spin,
  Tabs,
  Textarea,
  Tooltip,
  Upload,
]) {
  app.use(component)
}
app.use(i18n)
app.use(router)

app.mount('#app')
