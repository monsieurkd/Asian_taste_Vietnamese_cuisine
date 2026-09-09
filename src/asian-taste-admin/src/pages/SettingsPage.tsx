import { useState } from "react"
import { Save, MapPin, Phone, Mail, Clock, Bell, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

type SettingsTab = "general" | "hours" | "notifications"

/**
 * Settings page for restaurant configuration.
 */
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  const [hasChanges, setHasChanges] = useState(false)
  const { toast } = useToast()

  // Mock settings data - TODO: Connect to API
  const [settings, setSettings] = useState({
    restaurantName: "Asian Taste Vietnamese Cuisine",
    phone: "(555) 123-4567",
    email: "contact@asiantaste.com",
    address: "123 Main Street, City, State 12345",
    pickupMinutes: "15",
    confirmationMessage: "Thank you for your order! We will have it ready soon.",
    enableOnlineOrders: true,
  })

  // Operating hours by day
  const [operatingHours, setOperatingHours] = useState({
    Monday: { open: "10:00", close: "21:00", closed: false },
    Tuesday: { open: "10:00", close: "21:00", closed: false },
    Wednesday: { open: "10:00", close: "21:00", closed: false },
    Thursday: { open: "10:00", close: "21:00", closed: false },
    Friday: { open: "10:00", close: "22:00", closed: false },
    Saturday: { open: "11:00", close: "22:00", closed: false },
    Sunday: { open: "11:00", close: "21:00", closed: false },
  })

  const days: Array<keyof typeof operatingHours> = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

  // Handle save
  const handleSave = () => {
    // TODO: Call settings API
    console.log("Saving settings:", settings, operatingHours)
    toast({
      title: "Success",
      description: "Settings saved successfully",
    })
    setHasChanges(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-gray-500">
            Configure your restaurant information and preferences
          </p>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general" className="gap-2">
            <MapPin className="w-4 h-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-2">
            <Clock className="w-4 h-4" />
            Hours
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Restaurant Information */}
            <Card>
              <CardHeader>
                <CardTitle>Restaurant Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="restaurant-name">Restaurant Name</Label>
                  <Input
                    id="restaurant-name"
                    value={settings.restaurantName}
                    onChange={(e) => {
                      setSettings({ ...settings, restaurantName: e.target.value })
                      setHasChanges(true)
                    }}
                  />
                </div>

                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      className="pl-10"
                      value={settings.phone}
                      onChange={(e) => {
                        setSettings({ ...settings, phone: e.target.value })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      className="pl-10"
                      value={settings.email}
                      onChange={(e) => {
                        setSettings({ ...settings, email: e.target.value })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    rows={3}
                    value={settings.address}
                    onChange={(e) => {
                      setSettings({ ...settings, address: e.target.value })
                      setHasChanges(true)
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Order Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Order Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="pickup-minutes">Default Pickup Time (minutes)</Label>
                  <Input
                    id="pickup-minutes"
                    type="number"
                    min="5"
                    max="60"
                    value={settings.pickupMinutes}
                    onChange={(e) => {
                      setSettings({ ...settings, pickupMinutes: e.target.value })
                      setHasChanges(true)
                    }}
                  />
                </div>

                <div>
                  <Label htmlFor="confirmation-message">Order Confirmation Message</Label>
                  <Textarea
                    id="confirmation-message"
                    rows={3}
                    value={settings.confirmationMessage}
                    onChange={(e) => {
                      setSettings({ ...settings, confirmationMessage: e.target.value })
                      setHasChanges(true)
                    }}
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b">
                  <div>
                    <p className="font-medium">Enable Online Orders</p>
                    <p className="text-sm text-gray-500">Allow customers to place orders online</p>
                  </div>
                  <Switch
                    id="enable-online"
                    checked={settings.enableOnlineOrders}
                    onCheckedChange={(checked) => {
                      setSettings({ ...settings, enableOnlineOrders: checked })
                      setHasChanges(true)
                    }}
                  />
                </div>
                {settings.enableOnlineOrders && (
                  <Badge variant="success" className="ml-2">Active</Badge>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Hours Tab */}
        <TabsContent value="hours" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Operating Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {days.map((day) => {
                  const hours = operatingHours[day]
                  return (
                    <div key={day} className="flex items-center gap-4 py-2 border-b last:border-b-0">
                      <div className="w-40 font-medium">{day}</div>

                      {hours.closed ? (
                        <Badge variant="error" className="w-20 justify-center">Closed</Badge>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-1">
                            <div>
                              <Label htmlFor={`${day}-open`} className="sr-only">
                                Open Time
                              </Label>
                              <Input
                                id={`${day}-open`}
                                type="time"
                                className="w-32"
                                defaultValue={hours.open}
                                onChange={() => setHasChanges(true)}
                              />
                            </div>
                            <span>to</span>
                            <div>
                              <Label htmlFor={`${day}-close`} className="sr-only">
                                Close Time
                              </Label>
                              <Input
                                id={`${day}-close`}
                                type="time"
                                className="w-32"
                                defaultValue={hours.close}
                                onChange={() => setHasChanges(true)}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`${day}-closed`}
                              checked={!hours.closed}
                              onCheckedChange={(checked) => {
                                setOperatingHours({
                                  ...operatingHours,
                                  [day]: { ...hours, closed: !checked }
                                })
                                setHasChanges(true)
                              }}
                            />
                            <span className="text-sm text-gray-500">Open</span>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium">New Order Alerts</p>
                  <p className="text-sm text-gray-500">Receive notifications for new customer orders</p>
                </div>
                <Switch defaultChecked={true} />
              </div>

              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium">Order Status Updates</p>
                  <p className="text-sm text-gray-500">Get notified when order status changes</p>
                </div>
                <Switch defaultChecked={true} />
              </div>

              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium">Daily Summary Report</p>
                  <p className="text-sm text-gray-500">Receive daily sales summary via email</p>
                </div>
                <Switch defaultChecked={true} />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">Low Inventory Alerts</p>
                  <p className="text-sm text-gray-500">Alert when popular items are running low</p>
                </div>
                <Switch defaultChecked={false} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Success Message */}
      {hasChanges && (
        <div className="fixed bottom-4 right-4 bg-success text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-right-5">
          <CheckCircle2 className="w-5 h-5" />
          <div>
            <p className="font-medium">Settings saved successfully!</p>
            <p className="text-sm opacity-90">All changes have been applied.</p>
          </div>
        </div>
      )}
    </div>
  )
}
