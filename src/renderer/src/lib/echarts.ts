// ECharts 按需引入：只注册用到的图表/组件/渲染器，bundle 从 3.3MB 砍到 ~1MB
// echarts-for-react 通过 echarts prop 接收这个实例（默认会引全量 echarts）
import * as echarts from 'echarts/core'
import { PieChart, TreemapChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([TreemapChart, PieChart, TooltipComponent, TitleComponent, CanvasRenderer])

export default echarts
