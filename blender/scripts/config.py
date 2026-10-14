# -*- coding: utf-8 -*-
"""模型尺寸参数表，单位都是米，和 three.js 场景 1:1。"""

import os

# 输出路径
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GLB_DIR = os.path.join(ROOT_DIR, "output", "glb")
BLEND_DIR = os.path.join(ROOT_DIR, "output", "blend")

# 全局开关
FLAT_SHADING = True     # 低模，关掉平滑保留硬转折
EXPORT_DRACO = False    # 改 True 要压体积，前端得挂 DRACOLoader
SEGMENTS = 12           # 圆柱默认分段，低模够用

# 塔吊（参考 QTZ63 自升式）
CRANE_MAST_SIZE = 1.8       # 标准节截面边长
CRANE_SECTION_H = 2.5       # 标准节高度
CRANE_SECTION_N = 12        # 标准节数量，塔身高约 30m
CRANE_MEMBER = 0.10         # 桁架杆件截面
CRANE_JIB_LEN = 40.0        # 大臂长度
CRANE_COUNTER_LEN = 12.0    # 平衡臂长度
CRANE_CAB_SIZE = (1.6, 1.6, 2.0)   # 司机室尺寸
CRANE_WALL_TIE_Z = [12.0]               # 附墙标高，只留能锚进楼层的一道
CRANE_WALL_TIE_REACH = 6.0              # 附墙杆伸出，刚好顶到 1 号楼东外墙
CRANE_LADDER_FACE = -1                  # 爬梯所在面，-1 表示 -Y 面
CRANE_REST_PLATFORM_Z = 15.0            # 休息平台标高

# 施工升降机（SC200/200）
HOIST_HEIGHT = 30.0         # 导轨架高度
HOIST_CAGE_SIZE = (3.0, 1.5, 2.3)  # 吊笼尺寸
HOIST_RACK_W = 0.8          # 导轨架宽度
HOIST_CABLE = 0.05          # 电缆直径

# 脚手架（扣件式钢管）
SCAF_BAY = 1.5              # 立杆纵距
SCAF_ROW = 1.05             # 立杆横距（架宽）
SCAF_STEP = 1.8             # 步距
SCAF_SPAN_X = 5             # 纵向跨数
SCAF_STEP_N = 8             # 步数，架高 14.4m
SCAF_TUBE = 0.048           # 钢管外径，近似按方杆画
SCAF_TOE_H = 0.18           # 挡脚板高度

# 在建楼层（框架结构）
FRAME_SPAN_X = 3            # X 方向跨数
FRAME_SPAN_Y = 3            # Y 方向跨数
FRAME_GRID = 6.0            # 柱网间距
FRAME_STOREY_H = 3.0        # 层高
FRAME_STOREY_N = 3          # 已建层数
FRAME_COL = 0.45            # 柱截面
FRAME_BEAM_W = 0.3          # 梁宽
FRAME_BEAM_H = 0.6          # 梁高
FRAME_SLAB = 0.12           # 楼板厚度
FRAME_STAIR_BAY = (0, 2)    # 楼梯所在柱网（X 跨, Y 跨）
FRAME_WALL_T = 0.20         # 填充墙厚度

# 活动板房（箱式房）
HOUSE_SIZE = (6.0, 3.0, 2.8)   # 单间 长 × 宽 × 高
HOUSE_COUNT = 3                # 一排做几间
HOUSE_ROOF_H = 0.35            # 屋顶起坡高度

# 工地大门
GATE_WIDTH = 8.0            # 门洞净宽
GATE_PILLAR_W = 1.0         # 门柱宽度
GATE_HEIGHT = 5.5           # 门柱高度
GATE_HOUSE_SIZE = (3.0, 3.0, 2.8)  # 门卫室尺寸

# 围挡（彩钢板）
FENCE_PANEL_W = 3.0         # 单块围挡宽度
FENCE_HEIGHT = 2.0          # 围挡高度
FENCE_POST = 0.12           # 立柱截面
FENCE_COUNT = 6             # 默认生成几块

# 场地
SITE_SIZE = 110.0           # 场地边长（正方形），够放下土方区
GROUND_THICKNESS = 0.4      # 地面厚度
ROAD_WIDTH = 7.0            # 场内主路宽度

# 土方作业区（基坑 / 土堆）
PIT_ENABLE = True           # 置 False 时地面整块铺素土
# 基坑矩形 (x0, x1, y0, y1)，场地局部坐标
PITS = [
    (-32.0, -12.0, 29.0, 51.0),   # 西坑
    (-5.0, 12.0, 29.0, 51.0),
]
PIT_DEPTH = 1.8             # 基坑深度
PIT_WALL = 0.5              # 坑壁厚度
# 土堆改成独立模型 dirt_pile，位置大小见前端 layout.js

# 路灯
LAMP_HEIGHT = 9.0           # 灯杆高度
LAMP_ARM = 1.8              # 悬臂长度

# 生活区（工人宿舍）
CAMP_ROWS = 3               # 宿舍排数
CAMP_ROOMS = 3              # 每排房间数

# 挖掘机（履带式，正面朝 +X）
EXC_TRACK_LEN = 4.2         # 履带长度
EXC_TRACK_W = 0.72          # 单条履带宽度
EXC_TRACK_H = 0.9           # 履带高度
EXC_TRACK_GAP = 1.7         # 左右履带中心距
EXC_HOUSE_H = 1.05          # 履带顶面到平台底面
EXC_BOOM_LEN = 5.6          # 动臂长度
EXC_BOOM_ANGLE = 32.0       # 动臂仰角（度，相对水平）
EXC_STICK_LEN = 3.6         # 斗杆长度
EXC_STICK_ANGLE = -70.0     # 斗杆绝对倾角（度，负值向下）
EXC_BUCKET_W = 1.25         # 铲斗宽度
EXC_BUCKET_R = 1.25         # 铲斗挖掘半径

# 自卸翻斗车（正面朝 +X）
TRUCK_W = 2.5               # 车宽
TRUCK_WHEEL_R = 0.55        # 车轮半径
TRUCK_CHASSIS_H = 0.9       # 底盘高度
TRUCK_CAB_LEN = 2.4         # 驾驶室长度
TRUCK_CAB_H = 2.0           # 驾驶室高度
TRUCK_BED_LEN = 5.6         # 车厢长度
TRUCK_BED_WALL = 1.35       # 车厢侧板高度
