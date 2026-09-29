local HttpService = game:GetService("HttpService")
local player = game:GetService("Players").LocalPlayer

-- ใส่ IP หรือ Domain ของเซิร์ฟเวอร์หลังบ้านตรงนี้
local SERVER_URL = "http://YOUR_SERVER_IP:3000/api/update" 

local function extractNumber(text)
    if not text then return 0 end
    local cleanText = string.gsub(text, ",", "")
    local num = string.match(cleanText, "%d+%.?%d*")
    return tonumber(num) or 0
end

local function getPlayerData()
    local pGui = player:WaitForChild("PlayerGui", 10)
    
    -- ตัวอย่างการดึงค่า (ปรับ Path ตาม UI จริงในเกม)
    local bankText = "Bank Balance: $0" 
    local fishingLevel = 0
    local farmingLevel = 0
    local shelfStockerLevel = 0
    local vehiclesOwned = "Urus" 

    return {
        username = player.Name,
        bank = extractNumber(bankText),
        levels = {
            fishing = fishingLevel,
            farming = farmingLevel,
            shelfStocker = shelfStockerLevel
        },
        vehicles = vehiclesOwned
    }
end

-- ลูปส่ง Heartbeat ทุกๆ 30 วินาที
task.spawn(function()
    while true do
        local success, data = pcall(getPlayerData)
        if success then
            pcall(function()
                request({
                    Url = SERVER_URL,
                    Method = "POST",
                    Headers = { ["Content-Type"] = "application/json" },
                    Body = HttpService:JSONEncode(data)
                })
            end)
        end
        task.wait(30)
    end
end)