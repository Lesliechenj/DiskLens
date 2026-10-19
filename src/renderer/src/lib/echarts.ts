// ECharts 按需引入：只注册用到的图表/组件/渲染器，bundle 从 3.3MB 砍到 ~1MB
import * as echarts from 'echarts/core'
import { BarChart, PieChart, SunburstChart, TreemapChart } from 'echarts/charts'
import {
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  TreemapChart,
  SunburstChart,
  PieChart,
  BarChart,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  GridComponent,
  GraphicComponent,
  CanvasRenderer
])

export default echarts
