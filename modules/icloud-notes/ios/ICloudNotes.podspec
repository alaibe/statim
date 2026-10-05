Pod::Spec.new do |s|
  s.name           = 'ICloudNotes'
  s.version        = '1.0.0'
  s.summary        = 'Subscribes the iPhone to the notes the desktop leaves in iCloud'
  s.author         = ''
  s.homepage       = 'https://github.com/alaibe/statim'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'CloudKit'
  s.source_files = '**/*.swift'
end
