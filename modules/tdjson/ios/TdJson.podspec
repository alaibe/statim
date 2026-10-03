Pod::Spec.new do |s|
  s.name           = 'TdJson'
  s.version        = '1.0.0'
  s.summary        = "TDLib's JSON interface"
  s.author         = ''
  s.homepage       = 'https://github.com/alaibe/statim'
  s.platforms      = { :ios => '18.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'

  tdlib = 'Frameworks/libtdjson.xcframework'
  s.vendored_frameworks = tdlib if File.exist?(File.join(__dir__, tdlib))
end
